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
    this.config = loadConfig();
    this.cache = loadCache();
    this.source = new Map();
    this.listeners = new Set();
    this.disposers = [];
    this.active = false;
    this.scanning = false;
  }

  init() {
    if (this.active) return;
    this.active = true;
    this.captureExisting();
    this.installCapture();
    this.disposers.push(() => this.restoreCapture());
    this.installLanguage();
    this.emit();
  }

  stop() {
    this.active = false;
    for (const dispose of this.disposers.splice(0)) {
      try { dispose(); } catch {}
    }
  }

  captureExisting() {
    const snapshot = this.ctx.locale?.getSnapshot?.();
    if (snapshot) this.emit();
  }

  installCapture() {
    const locale = this.ctx.locale;
    if (!locale || typeof locale.register !== "function") return;
    const original = locale.register;
    const runtime = this;
    locale.register = function(ns, localeOrDicts, dict) {
      const result = original.call(this, ns, localeOrDicts, dict);
      if (runtime.active) runtime.capture(ns, localeOrDicts, dict);
      return result;
    };
    this._originalRegister = original;
  }

  restoreCapture() {
    if (this._originalRegister && this.ctx.locale) {
      this.ctx.locale.register = this._originalRegister;
      this._originalRegister = null;
    }
  }

  installLanguage() {
    try { this.ctx.locale.addLanguage({ id: "ru-auto", label: "Русский (автоперевод)", fallback: "ru" }); } catch {}
  }

  capture(ns, localeOrDicts, dict) {
    const dicts = typeof localeOrDicts === "string" ? { [localeOrDicts]: dict } : localeOrDicts;
    if (!dicts || typeof dicts !== "object") return;
    const source = dicts.en || dicts.zh;
    if (!source || typeof source !== "object") return;
    for (const [key, text] of Object.entries(source)) {
      if (typeof text !== "string" || !text.trim()) continue;
      this.source.set(`${ns}.${key}`, { id: `${ns}.${key}`, ns, key, text, sourceLang: dicts.en?.[key] ? "en" : "zh" });
    }
    this.emit();
  }

  getTranslation(ns, key) {
    return this.cache.entries.find((e) => e.ns === ns && e.key === key)?.translation || "";
  }

  getSnapshot() {
    const items = [...this.source.values()];
    const translated = items.filter((item) => this.getTranslation(item.ns, item.key)).length;
    return {
      configured: Boolean(this.config.apiKey && this.config.model),
      enabled: this.config.enabled,
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
    this.config = { ...this.config, ...sanitizeConfig(patch) };
    saveConfig(this.config);
    this.emit();
  }

  async translateMissing() {
    if (!this.config.enabled) throw new Error("Сначала включите автоперевод.");
    if (!this.config.apiKey) throw new Error("Укажите API-ключ.");
    if (this.scanning) return { translated: 0 };
    this.scanning = true;
    let count = 0;
    try {
      const missing = [...this.source.values()].filter((x) => !this.getTranslation(x.ns, x.key));
      for (let i = 0; i < missing.length; i += this.config.batchSize) {
        const batch = missing.slice(i, i + this.config.batchSize);
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
          if (!translation || !placeholderParity(item.text, translation)) continue;
          this.cache.entries.push({ ns: item.ns, key: item.key, source: item.text, translation, model: this.config.model, updatedAt: Date.now() });
          count++;
        }
        saveCache(this.cache);
        this.emit();
      }
      return { translated: count, pending: this.getSnapshot().pending };
    } finally { this.scanning = false; }
  }
}

function sanitizeConfig(input) {
  const out = {};
  for (const key of ["enabled", "endpoint", "model", "apiKey", "batchSize"]) if (key in input) out[key] = input[key];
  if (typeof out.endpoint === "string" && !/^https:\/\//i.test(out.endpoint)) delete out.endpoint;
  if ("batchSize" in out) out.batchSize = Math.min(64, Math.max(1, Number(out.batchSize) || 24));
  return out;
}
function loadConfig() { try { return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(`${STORAGE_KEY}.config`) || "{}") }; } catch { return { ...DEFAULT_CONFIG }; } }
function saveConfig(v) { try { localStorage.setItem(`${STORAGE_KEY}.config`, JSON.stringify(v)); } catch {} }
function loadCache() { try { const v = JSON.parse(localStorage.getItem(`${STORAGE_KEY}.cache`) || "{}"); return { entries: Array.isArray(v.entries) ? v.entries : [] }; } catch { return { entries: [] }; } }
function saveCache(v) { try { localStorage.setItem(`${STORAGE_KEY}.cache`, JSON.stringify(v)); } catch {} }
function placeholderParity(a, b) { const rx = /\{(\w+)\}/g; return JSON.stringify([...a.matchAll(rx)].map((m) => m[1]).sort()) === JSON.stringify([...b.matchAll(rx)].map((m) => m[1]).sort()); }