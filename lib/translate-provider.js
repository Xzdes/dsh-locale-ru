/**
 * dsh-locale-ru — translation provider interface.
 *
 * Sends batches of UI strings to an OpenAI-compatible endpoint and returns
 * translated values. Never sends user content, paths or secrets — only
 * the stable UI dictionary entries harvested from ctx.locale.register.
 *
 * Design rules:
 * - preserves `{placeholder}` variables byte-for-byte.
 * - fails closed: network or parse errors leave the original string.
 * - JSON responses are validated (exact set of original IDs, no duplicates).
 * - No bundled API keys – they come from the Settings row (localStorage).
 */
const DEFAULT_ENDPOINT = "https://api.deepseek.com/v1/chat/completions";
const DEFAULT_MODEL = "deepseek-chat";
const DEFAULT_BATCH = 24;

/** Produce the system prompt for the translation model. */
function defaultSystem(targetLang) {
  return `You are a professional UI translator. Translate the given JSON array of strings into ${targetLang}.

Rules:
- Return ONLY a JSON array of objects: [{"id": "original", "translation": "translated"}, ...]
- Preserve ALL {placeholder} variables exactly (no spaces inside braces).
- Do not translate placeholder names.
- Keep formatting (Markdown, HTML entities) intact.
- Repeat unchanged if already in target language.
- No explanations, no extra fields, no markdown fences.`;
}

/** Extract JSON from model response, tolerating markdown fences. */
function extractJson(text) {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1] : text;
  try { return JSON.parse(candidate); } catch { return null; }
}

/** Ensure the model output is a valid array of unique IDs matching `expectedIds`. */
function validateResponse(parsed, expectedIds) {
  if (!Array.isArray(parsed)) return false;
  const seen = new Set();
  for (const item of parsed) {
    if (!item || typeof item.id !== "string" || typeof item.translation !== "string") return false;
    if (!expectedIds.has(item.id)) return false;
    if (seen.has(item.id)) return false;
    seen.add(item.id);
  }
  return seen.size === expectedIds.size;
}

function placeholderParity(a, b) {
  const rx = /\{(\w+)\}/g;
  const aPh = [...a.matchAll(rx)].map((m) => m[1]).sort();
  const bPh = [...b.matchAll(rx)].map((m) => m[1]).sort();
  return JSON.stringify(aPh) === JSON.stringify(bPh);
}

export const TranslateProvider = {
  /** Build the request body for one batch. */
  buildRequest({ endpoint, model, sourceLang, targetLang, batch, systemPrompt }) {
    return {
      endpoint: endpoint || DEFAULT_ENDPOINT,
      model: model || DEFAULT_MODEL,
      messages: [
        { role: "system", content: systemPrompt || defaultSystem(targetLang) },
        { role: "user", content: JSON.stringify({ sourceLang, targetLang, batch }) },
      ],
      temperature: 0,
    };
  },

  /**
   * Translate a single batch. Returns a Map<id, translation>.
   * On any failure returns an empty Map so the caller can fall back to English.
   */
  async translate({ endpoint, apiKey, model, sourceLang, targetLang, items, signal }) {
    if (!items || items.length === 0) return new Map();
    if (!apiKey) throw new Error("API key is required");

    const body = TranslateProvider.buildRequest({ endpoint, model, sourceLang, targetLang, batch: items });

    let response;
    try {
      const controller = new AbortController();
      const signals = signal ? [signal, controller.signal] : [controller.signal];
      const timeout = setTimeout(() => controller.abort(), 60000);
      response = await fetch(body.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: body.model,
          messages: body.messages,
          temperature: body.temperature,
        }),
        signal: AbortSignal.any(signals),
      });
      clearTimeout(timeout);
    } catch (err) {
      if (err.name === "AbortError" || err.name === "TimeoutError") {
        throw new Error("Translation request timed out");
      }
      throw new Error(`Network error: ${err.message}`);
    }

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const data = await response.json();
        if (data.error?.message) detail += ` — ${data.error.message}`;
      } catch {}
      throw new Error(detail);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("Empty response from translation model");

    const parsed = extractJson(content);
    if (!parsed) throw new Error("Failed to parse model response as JSON");

    const expectedIds = new Set(items.map((x) => x.id));
    if (!validateResponse(parsed, expectedIds)) {
      throw new Error("Model response validation failed: missing or duplicate IDs");
    }

    const result = new Map();
    for (const item of parsed) {
      const original = items.find((x) => x.id === item.id);
      if (original && placeholderParity(original.text, item.translation)) {
        result.set(item.id, item.translation);
      }
    }
    return result;
  },
};