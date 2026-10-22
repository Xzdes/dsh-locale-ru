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
  if (!Array.isArray(parsed) || parsed.length !== expectedIds.size) return false;
  const seen = new Set();
  for (const item of parsed) {
    if (!item || typeof item.id !== "string" || typeof item.translation !== "string") return false;
    if (!expectedIds.has(item.id) || seen.has(item.id)) return false;
    seen.add(item.id);
  }
  return seen.size === expectedIds.size;
}

function placeholderParity(a, b) {
  const rx = /\{([\w.-]+)\}/g;
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
    if (!Array.isArray(items) || items.length === 0) return new Map();
    if (typeof apiKey !== "string" || !apiKey.trim()) throw new Error("API key is required");
    if (items.length > 64 || items.some((item) => !item || typeof item.id !== "string" || typeof item.text !== "string")) {
      throw new Error("Invalid translation batch");
    }
    let endpointUrl;
    try {
      endpointUrl = new URL(endpoint || DEFAULT_ENDPOINT);
      if (endpointUrl.protocol !== "https:" || endpointUrl.username || endpointUrl.password) throw new Error();
    } catch { throw new Error("Endpoint must be a valid HTTPS URL without embedded credentials"); }
    const body = TranslateProvider.buildRequest({ endpoint: endpointUrl.href, model: (model || DEFAULT_MODEL).trim(), sourceLang, targetLang, batch: items });

    let response;
    let timeoutId;
    let controller;
    try {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      if (typeof fetch !== "function" || typeof AbortController !== "function") throw new Error("This runtime does not support fetch or AbortController");
      controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 60000);
      response = await fetch(body.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey.trim()}` },
        body: JSON.stringify({ model: body.model, messages: body.messages, temperature: body.temperature }),
        signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
      });
    } catch (err) {
      if (err.name === "AbortError" || err.name === "TimeoutError") throw new Error("Translation request cancelled or timed out");
      throw new Error(`Network error: ${err?.message || String(err)}`);
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const data = await response.json();
        if (data.error?.message) detail += ` — ${data.error.message}`;
      } catch {}
      throw new Error(detail);
    }

    let data;
    try { data = await response.json(); }
    catch { throw new Error("Translation provider returned invalid JSON"); }
    const content = typeof data?.choices?.[0]?.message?.content === "string" ? data.choices[0].message.content.trim() : "";
    if (!content) throw new Error("Empty response from translation model");

    const parsed = extractJson(content);
    if (!parsed) throw new Error("Failed to parse model response as JSON");

    const expectedIds = new Set(items.map((x) => x.id));
    if (!validateResponse(parsed, expectedIds)) {
      throw new Error("Model response validation failed: missing or duplicate IDs");
    }

    const byId = new Map(items.map((item) => [item.id, item]));
    const result = new Map();
    for (const item of parsed) {
      const original = byId.get(item.id);
      if (original && item.translation.trim() && placeholderParity(original.text, item.translation)) {
        result.set(item.id, item.translation);
      }
    }
    return result;
  },
};