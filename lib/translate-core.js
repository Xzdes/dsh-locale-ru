/**
 * Lazy automatic translation runtime for DSH locale dictionaries.
 * It is only activated while the settings row is mounted.
 */
import { TranslateProvider } from "./translate-provider.js";

const STORAGE_KEY = "dsh-locale-ru.auto-translate.v2";
const DEFAULT_CONFIG = {
  enabled: false,
  endpoint: "https://api.deepseek.com/v1/chat/completions",
  model: "deepseek-chat",
  apiKey: "",
  batchSize: 24,
};

export class TranslationRuntime {
  constructor(ctx) {
    this.ctx = ctx;
    this.active = false;
    this.disposed = false;
    this.scanning = false;
    this.config = loadConfig();
    this.cache = loadCache();
    this.source = new Map();
    this.registeredAuto = new Map();
    this.registeredDisposers = new Map();
    this._autoLanguageDisposer = null;
    this.listeners = new Set();
    this.scanning = false;
  }

  init() {
    if (this.active || this.disposed) return;
    this.active = true;
    try {
      this.installCapture();
      if (this.config.enabled) this.ensureAutoLanguage();
    } catch (error) {
      this.active = false;
      this.restoreCapture();
      throw error;
    }
    this.emit();
  }

  ensureAutoLanguage() {
    if (this._autoLanguageDisposer) return;
    try {
      const dispose = this.ctx.locale.addLanguage({ id: "ru-auto", label: "Русский + автоперевод", fallback: "ru" });
      this._autoLanguageDisposer = typeof dispose === "function" ? dispose : () => {};
    } catch {
      // Duplicate activation is non-fatal; it should not hide the base language.
      this._autoLanguageDisposer = () => {};
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.active = false;
    this.restoreCapture();
    this.removeAutoTranslations();
  }

  installCapture() {
    const locale = this.ctx.locale;
    if (!locale || typeof locale.register !== "function") return;
    const previous = locale.register;
    const runtime = this;
    const wrapper = function(ns, localeOrDicts, dict) {
      const result = previous.call(this, ns, localeOrDicts, dict);
      if (runtime.active) {
        try { runtime.capture(ns, localeOrDicts, dict); } catch (error) { console.warn("dsh-locale-ru: dictionary capture failed", error); }
      }
      return result;
    };
    this._capturePatch = { locale, previous, wrapper };
    locale.register = wrapper;
  }

  restoreCapture() {
    const patch = this._capturePatch;
    if (!patch) return;
    if (patch.locale.register === patch.wrapper) patch.locale.register = patch.previous;
    this._capturePatch = null;
  }

  capture(ns, localeOrDicts, dict) {
    const dicts = typeof localeOrDicts === "string" ? { [localeOrDicts]: dict } : localeOrDicts;
    if (!dicts || typeof dicts !== "object") return;
    if (typeof ns !== "string" || !ns || !dicts || typeof dicts !== "object" || Array.isArray(dicts)) return;
    const en = isPlainDictionary(dicts.en) ? dicts.en : {};
    const zh = isPlainDictionary(dicts.zh) ? dicts.zh : {};
    const keys = new Set([...Object.keys(en), ...Object.keys(zh)]);
    for (const key of keys) {
      const enText = typeof en[key] === "string" ? en[key] : "";
      const zhText = typeof zh[key] === "string" ? zh[key] : "";
      const text = enText.trim() ? enText : zhText;
      if (!text.trim()) continue;
      const id = JSON.stringify([ns, key]);
      this.source.set(id, { id, ns, key, text, sourceLang: enText.trim() ? "en" : "zh" });
    }
    this.applyTranslations(ns);
    this.emit();
  }

  getTranslation(ns, key) {
    const source = this.source.get(JSON.stringify([ns, key]));
    const entry = this.cache.entries.find((e) => e.ns === ns && e.key === key && (!source || e.source === source.text));
    return typeof entry?.translation === "string" ? entry.translation : "";
  }

  applyTranslations(ns) {
    if (!this.config.enabled || !this.active || this.disposed) return;
    this.ensureAutoLanguage();
    const dictionary = {};
    for (const item of this.source.values()) {
      if (item.ns !== ns) continue;
      const translation = this.getTranslation(ns, item.key);
      if (translation) dictionary[item.key] = translation;
    }
    if (!Object.keys(dictionary).length) return;
    const signature = JSON.stringify(dictionary);
    if (this.registeredAuto.get(ns) === signature) return;
    // DSH rejects a second ru dictionary for a namespace. Use a separate
    // locale falling back to Russian; it can be selected after translation.
    try {
      const localeAlreadyRegistered = this.registeredAuto.has(ns);
      if (localeAlreadyRegistered) {
        // Language registry rejects a second registration for one ns+locale.
        // If this namespace gained new strings after first application, the
        // original stored object is still mutable, so update it in place.
        const existing = this.registeredAuto.get(`${ns}:dictionary`);
        Object.assign(existing, dictionary);
      } else {
        const disposable = this.ctx.locale.register(ns, "ru-auto", dictionary);
        this.registeredAuto.set(`${ns}:dictionary`, dictionary);
        this.registeredAuto.set(ns, signature);
        if (typeof disposable === "function") this.registeredDisposers.set(ns, disposable);
      }
      this.registeredAuto.set(ns, signature);
    } catch (error) {
      // A `ru` dictionary may already exist. Merge by registering only if no
      // existing language registration exists is not supported by Locale API;
      // treat duplicate registration as non-fatal and retain the cached result.
      if (!/already has locale/i.test(error?.message || "")) console.warn("dsh-locale-ru: failed to apply translated dictionary", error);
    }
  }

  removeAutoTranslations() {
    for (const dispose of this.registeredDisposers.values()) { try { dispose?.(); } catch {} }
    this.registeredDisposers.clear();
    this.registeredAuto.clear();
    try { this._autoLanguageDisposer?.(); } catch {}
    this._autoLanguageDisposer = null;
  }

  getSnapshot() {
    const items = [...this.source.values()];
    const translated = items.filter((item) => this.getTranslation(item.ns, item.key)).length;
    return {
      configured: Boolean(this.config.apiKey && this.config.model && this.config.endpoint),
      enabled: this.config.enabled,
      scanning: this.scanning,
      model: this.config.model,
      endpoint: this.config.endpoint,
      apiKey: this.config.apiKey,
      namespaces: new Set(items.map((x) => x.ns)).size,
      strings: items.length,
      translated,
      pending: items.length - translated,
      cacheEntries: this.cache.entries.length,
    };
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of [...this.listeners]) { try { fn(); } catch {} } }

  updateConfig(patch) {
    const wasEnabled = this.config.enabled;
    this.config = { ...this.config, ...sanitizeConfig(patch) };
    saveConfig(this.config);
    if (!wasEnabled && this.config.enabled) {
      this.ensureAutoLanguage();
      for (const ns of new Set([...this.source.values()].map((item) => item.ns))) this.applyTranslations(ns);
    }
    if (wasEnabled && !this.config.enabled) this.removeAutoTranslations();
    this.emit();
  }

  async translateMissing() {
    if (!this.config.enabled) throw new Error("Сначала включите автоперевод.");
    if (!this.config.apiKey) throw new Error("Укажите API-ключ.");
    if (!this.config.model) throw new Error("Укажите название модели.");
    if (!this.config.endpoint) throw new Error("Укажите корректный HTTPS endpoint.");
    if (this.scanning) throw new Error("Перевод уже выполняется.");
    this.scanning = true;
    this.emit();
    let count = 0;
    const errors = [];
    try {
      const missing = [...this.source.values()].filter((x) => !this.getTranslation(x.ns, x.key));
      if (missing.length === 0) return { translated: 0, pending: 0, errors: [] };
      const batchSize = this.config.batchSize;
      for (let i = 0; i < missing.length; i += batchSize) {
        const batch = missing.slice(i, i + batchSize);
        try {
          const result = await TranslateProvider.translate({
            endpoint: this.config.endpoint,
            apiKey: this.config.apiKey,
            model: this.config.model,
            sourceLang: batch.every((x) => x.sourceLang === "zh") ? "zh" : "en/zh",
            targetLang: "Russian (ru)",
            items: batch,
          });
          for (const item of batch) {
            const translation = result.get(item.id);
            if (typeof translation !== "string" || !translation.trim() || !placeholderParity(item.text, translation)) continue;
            this.cache.entries = this.cache.entries.filter((e) => !(e.ns === item.ns && e.key === item.key));
            this.cache.entries.push({ ns: item.ns, key: item.key, source: item.text, translation, model: this.config.model, updatedAt: Date.now() });
            count++;
            this.applyTranslations(item.ns);
          }
        } catch (error) {
          errors.push(error?.message || String(error));
        }
        saveCache(this.cache);
        this.emit();
      }
      return { translated: count, pending: this.getSnapshot().pending, errors };
    } finally {
      this.scanning = false;
      this.emit();
    }
  }
}

function isPlainDictionary(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function sanitizeConfig(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out = {};
  if (typeof input.enabled === "boolean") out.enabled = input.enabled;
  if (typeof input.endpoint === "string") {
    try {
      const parsed = new URL(input.endpoint.trim());
      if (parsed.protocol === "https:" && !parsed.username && !parsed.password) out.endpoint = parsed.href.replace(/\/$/, "");
      else out.endpoint = "";
    } catch { out.endpoint = ""; }
  }
  if (typeof input.model === "string") out.model = input.model.trim().slice(0, 128);
  if (typeof input.apiKey === "string") out.apiKey = input.apiKey.trim().slice(0, 4096);
  if ("batchSize" in input && Number.isFinite(Number(input.batchSize))) out.batchSize = Math.min(64, Math.max(1, Math.floor(Number(input.batchSize))));
  return out;
}
function loadConfig() {
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(`${STORAGE_KEY}.config`) || "{}");
    return { ...DEFAULT_CONFIG, ...sanitizeConfig(raw) };
  } catch { return { ...DEFAULT_CONFIG }; }
}
function saveConfig(value) { try { globalThis.localStorage?.setItem(`${STORAGE_KEY}.config`, JSON.stringify(value)); } catch {} }
function loadCache() {
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(`${STORAGE_KEY}.cache`) || "{}");
    const seen = new Set();
    const entries = [];
    for (const e of Array.isArray(raw?.entries) ? raw.entries : []) {
      if (!e || typeof e.ns !== "string" || typeof e.key !== "string" || typeof e.source !== "string" || typeof e.translation !== "string") continue;
      const id = JSON.stringify([e.ns, e.key]);
      if (!placeholderParity(e.source, e.translation) || seen.has(id)) continue;
      seen.add(id);
      entries.push({ ns: e.ns, key: e.key, source: e.source, translation: e.translation, model: typeof e.model === "string" ? e.model : "", updatedAt: Number(e.updatedAt) || 0 });
    }
    return { entries };
  } catch { return { entries: [] }; }
}
function saveCache(value) {
  try {
    const entries = value.entries.slice(-10000);
    globalThis.localStorage?.setItem(`${STORAGE_KEY}.cache`, JSON.stringify({ entries }));
  } catch {}
}
function placeholderParity(a, b) {
  const rx = /\{([\w.-]+)\}/g;
  const ph = (v) => [...String(v).matchAll(rx)].map((m) => m[1]).sort();
  return JSON.stringify(ph(a)) === JSON.stringify(ph(b));
}