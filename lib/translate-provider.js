/**
 * dsh-locale-ru — provider interface for automatic translation.
 *
 * Sends batches of strings to an OpenAI-compatible HTTP endpoint and returns
 * translated values. No provider credentials are bundled; the key comes from
 * the user's own Settings entry (stored in localStorage under our own key).
 *
 * Design rules:
 * - never sends user chat content, file paths or secrets — only UI strings.
 * - preserves `{placeholder}` variables byte-for-byte.
 * - fails closed: any network or parse error leaves the original string.
 */
const DEFAULT_ENDPOINT = "https://api.deepseek.com/v1/chat/completions";
const DEFAULT_MODEL = "deepseek-chat";
const DEFAULT_BATCH = 24;

export const TranslateProvider = {
  /** Build a request body for one batch. */
  buildRequest({ endpoint, model, sourceLang, targetLang, batch, systemPrompt }) {
    const messages = [
      { role: "system", content: systemPrompt || defaultSystem(targetLang) },
      {
        role: "user",
        content: JSON.stringify({
          sourceLang,
          targetLang,
          batch,
        }),
      },
    ];
    return {
      endpoint: endpoint || DEFAULT_ENDPOINT,
      model: model || DEFAULT_MODEL,
      messages,
      temperature: 0,
    };
  },

  /**
   * Translate one batch. Returns a Map<original, translated>.
   * On any failure returns an empty map so the caller can fall back to English.
   */
  async translate({ endpoint, apiKey, model, sourceLang, targetLang, items, signal }) {
    if (!items || items.length === 0) return new Map();
    if (!apiKey) throw new Error("translate: no API key configured");

    const endpointUrl = endpoint || DEFAULT_ENDPOINT;
    const body = {
      model: model || DEFAULT_MODEL,
      temperature: 0,
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(targetLang),
        },
        {
          role: "user",
          content: JSON.stringify({
            sourceLang,
            targetLang,
            items: items.map((item) => ({
              id: item.id,
              text: item.text,
            })),
          }),
        },
      ],
    };

    const response = await fetch(endpointUrl, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`translate: HTTP ${response.status}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.length === 0) {
      throw new Error("translate: empty response content");
    }

    return parseResponse(content, items);
  },
};

function buildSystemPrompt(targetLang) {
  return (
    `You are a professional translator. Translate every "text" value from English or Chinese ` +
    `into ${targetLang}. Return ONLY a JSON object mapping each "id" to its translation. ` +
    `Rules: keep all {placeholder} variables exactly as they appear, including braces. ` +
    `Do not translate brand names, protocol names, file extensions, code identifiers, ` +
    `or URLs. Keep the tone neutral and imperative for buttons and actions. ` +
    `If a string is already in the target language, return it unchanged. ` +
    `Never add explanations, never wrap in markdown fences.`
  );
}

function defaultSystem(targetLang) {
  return buildSystemPrompt(targetLang);
}

/**
 * Parse the model response into a Map<id, translation>.
 * Tolerates fenced code blocks and trailing text.
 */
function parseResponse(content, items) {
  let text = content.trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Try to find the first {...} block.
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return new Map();
    try {
      parsed = JSON.parse(text.slice(start, end + 1));
    } catch {
      return new Map();
    }
  }
  if (!parsed || typeof parsed !== "object") return new Map();

  const result = new Map();
  const byId = new Map(items.map((item) => [item.id, item]));
  for (const [id, value] of Object.entries(parsed)) {
    if (typeof value !== "string") continue;
    const original = byId.get(id);
    if (!original) continue;
    result.set(id, value);
  }
  return result;
}