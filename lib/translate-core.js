/**
 * Runtime dictionary collector, cache and translator.
 * Scope is intentionally limited to locale dictionaries registered by DSH
 * plugins. DOM text and chat/document content are not collected.
 */
import { TranslateProvider } from "./translate-provider.js";

const STORAGE_KEY = "dsh-locale-ru.auto-translate.v1";
const DEFAULT_CONFIG = {
  enabled: true,
  endpoint: "https://api.deepseek.com/v1/chat/completions",
  model: "deepseek-chat",
  apiKey: "",
  target: "ru",
  batchSize: 24,
};

export class TranslationRuntime {
  constructor(ctx) {
    this.ctx = ctx;
    this.config = loadConfig();
    this.cache = loadCache();
    this.source = new Map();
    this.ru = new Map();
    this.listeners = new Set();
    this.disposers = [];
    this.queue = [];
    this.scanning = false;
  }

  start() {
    this.installLocaleCapture();
    this.installLanguage();
    this.installSettingsRow();
    return () => this.stop();
  }

  stop() {
    for (const dispose of this.disposers.splice(0)) {
      try { dispose?.(); } catch {}
    }
  }

  updateConfig(patch) {
    this.config = { ...this.config, ...sanitizeConfig(patch) };
    saveConfig(this.config);
    this.emit();
  }

  getSnapshot() {
    const items = [...this.source.values()];
    const translated = items.filter((item) => this.getTranslation(item.ns, item.key));
    return {
      configured: Boolean(this.config.apiKey && this.config.model),
      enabled: this.config.enabled,
      namespaces: new Set(items.map((item) => item.ns)).size,
      strings: items.length,
      translated: translated.length,
      pending: items.length - translated.length,
      cacheEntries: this.cache.entries.length,
      model: this.config.model,
    };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit() {
    for (const listener of [...this.listeners]) {
      try { listener(); } catch {}
    }
  }

  /** Register a dictionary and immediately overlay cached/generated ru values. */
  capture(ns, localeOrDicts, dict) {
    const dicts = typeof localeOrDicts === "string" ? { [localeOrDicts]: dict } : localeOrDicts;
    if (!dicts || typeof dicts !== "object") return;
    const sourceDict = dicts.en || dicts.zh || {};
    for (const [key, text] of Object.entries(sourceDict)) {
      if (typeof text !== "string" || !text.trim()) continue;
      const item = { id: `${ns}.${key}`, ns, key, text, sourceLang: dicts.en?.[key] ? "en" : "zh" };
      this.source.set(item.id, item);
    }
    this.emit();
  }

  getTranslation(ns, key) {
    const item = this.cache.entries.find((entry) => entry.ns === ns && entry.key === key);
    return item?.translation || "";
  }

  getDictionary(ns) {
    const out = {};
    for (const item of this.source.values()) {
      if (item.ns !== ns) continue;
      const translation = this.getTranslation(ns, item.key);
      if (translation) out[item.key] = translation;
    }
    return out;
  }

  async translateMissing({ signal } = {}) {
    if (this.scanning) return { translated: 0, pending: this.getSnapshot().pending };
    if (!this.config.apiKey) throw new Error("Сначала укажите API-ключ в настройках перевода.");
    this.scanning = true;
    let translated = 0;
    try {
      const missing = [...this.source.values()].filter((item) => !this.getTranslation(item.ns, item.key));
      for (let i = 0; i < missing.length; i += this.config.batchSize) {
        const batch = missing.slice(i, i + this.config.batchSize);
        const result = await TranslateProvider.translate({
          endpoint: this.config.endpoint,
          apiKey: this.config.apiKey,
          model: this.config.model,
          sourceLang: batch.every((x) => x.sourceLang === "zh") ? "zh" : "en/zh",
          targetLang: "Russian (ru)",
          items: batch,
          signal,
        });
        for (const item of batch) {
          const value = result.get(item.id);
          if (!value || !placeholderParity(item.text, value)) continue;
          this.cache.entries.push({ ns: item.ns, key: item.key, source: item.text, translation: value, model: this.config.model, updatedAt: Date.now() });
          translated++;
        }
        saveCache(this.cache);
        this.emit();
      }
      return { translated, pending: this.getSnapshot().pending };
    } finally {
      this.scanning = false;
    }
  }

  installLocaleCapture() {
    const locale = this.ctx.locale;
    if (!locale || typeof locale.register !== "function") return;
    const original = locale.register.bind(locale);
    const runtime = this;
    locale.register = function(ns, localeOrDicts, dict) {
      runtime.capture(ns, localeOrDicts, dict);
      const result = original(ns, localeOrDicts, dict);
      if (localeOrDicts === "ru") return result;
      const generated = runtime.getDictionary(ns);
      if (Object.keys(generated).length) {
        try { original(ns, "ru", generated); } catch {}
      }
      return result;
    };
    this.disposers.push(() => { locale.register = original; });
  }

  installLanguage() {
    try {
      this.ctx.locale.addLanguage({ id: "ru", label: "Русский (автоперевод)", fallback: "en" });
    } catch {}
  }

  installSettingsRow() {
    if (!this.ctx.slots?.inject || typeof React === "undefined") return;
    const runtime = this;
    function AutoTranslateSettings() {
      const [snapshot, setSnapshot] = React.useState(runtime.getSnapshot());
      React.useEffect(() => runtime.subscribe(() => setSnapshot(runtime.getSnapshot())), []);
      const [status, setStatus] = React.useState("");
      return React.createElement("section", { style: { padding: "12px 0" } },
        React.createElement("strong", null, "Автоматический перевод плагинов"),
        React.createElement("p", null, `Словарей: ${snapshot.namespaces}; строк: ${snapshot.strings}; переведено: ${snapshot.translated}; осталось: ${snapshot.pending}`),
        React.createElement("label", null, "Модель ", React.createElement("input", { defaultValue: runtime.config.model, onChange: (e) => runtime.updateConfig({ model: e.target.value }) })),
        React.createElement("label", null, "API endpoint ", React.createElement("input", { defaultValue: runtime.config.endpoint, onChange: (e) => runtime.updateConfig({ endpoint: e.target.value }) })),
        React.createElement("label", null, React.createElement("input", { type: "password", placeholder: "API-ключ", defaultValue: runtime.config.apiKey, onChange: (e) => runtime.updateConfig({ apiKey: e.target.value }) })),
        React.createElement("button", { disabled: !snapshot.configured || !snapshot.pending, onClick: async () => { try { const r = await runtime.translateMissing(); setStatus(`Готово: ${r.translated}`); } catch (e) { setStatus(e.message); } } }, "Перевести новые строки"),
        status && React.createElement("p", null, status)
      );
    }
    this.ctx.slots.inject("settings.general.item", () => this.ctx.slots.register({
      name: "settings.general.item",
      id: "dsh-locale-ru-auto-translate",
      order: 920,
      locale: "settings.locale"
    }, AutoTranslateSettings));
  }
}

function placeholderParity(a, b) {
  const get = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
  return get(a) === get(b);
}

function sanitizeConfig(input) {
  const out = {};
  for (const key of ["enabled", "endpoint", "model", "apiKey", "target", "batchSize"]) if (key in input) out[key] = input[key];
  if (typeof out.endpoint === "string" && !/^https:\/\//i.test(out.endpoint)) delete out.endpoint;
  if (typeof out.batchSize !== "undefined") out.batchSize = Math.min(64, Math.max(1, Number(out.batchSize) || DEFAULT_CONFIG.batchSize));
  return out;
}
function loadConfig() { try { return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(`${STORAGE_KEY}.config`) || "{}") }; } catch { return { ...DEFAULT_CONFIG }; } }
function saveConfig(config) { try { localStorage.setItem(`${STORAGE_KEY}.config`, JSON.stringify(config)); } catch {} }
function loadCache() { try { const value = JSON.parse(localStorage.getItem(`${STORAGE_KEY}.cache`) || "{}"); return { entries: Array.isArray(value.entries) ? value.entries : [] }; } catch { return { entries: [] }; } }
function saveCache(cache) { try { localStorage.setItem(`${STORAGE_KEY}.cache`, JSON.stringify(cache)); } catch {} }
