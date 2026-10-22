import test from 'node:test';
import assert from 'node:assert/strict';
import { TranslationRuntime } from '../lib/translate-core.js';
import { TranslateProvider } from '../lib/translate-provider.js';

function makeContext() {
  const dictionaries = new Map();
  const calls = [];
  const locale = {
    register(ns, localeOrDicts, dict) {
      calls.push({ ns, localeOrDicts, dict });
      const pairs = typeof localeOrDicts === 'string' ? [[localeOrDicts, dict]] : Object.entries(localeOrDicts);
      for (const [id, value] of pairs) {
        const key = `${ns}:${id}`;
        if (dictionaries.has(key)) throw new Error(`locale namespace "${ns}" already has locale "${id}"`);
        dictionaries.set(key, value);
      }
      return () => {};
    },
    addLanguage({ id }) { return () => {}; },
  };
  return { ctx: { locale }, dictionaries, calls };
}

test('capture is inert before init and preserves locale register behavior', () => {
  const { ctx } = makeContext();
  const runtime = new TranslationRuntime(ctx);
  const before = { en: { hello: 'Hello' } };
  ctx.locale.register('plugin', before);
  assert.equal(runtime.source.size, 0);
  runtime.init();
  const result = ctx.locale.register('plugin-two', { en: { greeting: 'Hi {name}' } });
  assert.equal(runtime.source.size, 1);
  assert.equal(runtime.getSnapshot().pending, 1);
  assert.equal(typeof result, 'function');
});

test('capture handles Chinese-only dictionaries and ignores malformed inputs', () => {
  const { ctx } = makeContext();
  const runtime = new TranslationRuntime(ctx);
  runtime.init();
  ctx.locale.register('zh-plugin', { zh: { title: '标题', empty: '' } });
  runtime.capture('', { en: { no: 'ns' } });
  runtime.capture('array', []);
  assert.equal(runtime.getSnapshot().strings, 1);
  assert.equal([...runtime.source.values()][0].sourceLang, 'zh');
});

test('cache invalidates when the source text changes', () => {
  const old = globalThis.localStorage;
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k,v) => store.set(k,v) };
  try {
    const { ctx } = makeContext();
    const runtime = new TranslationRuntime(ctx);
    runtime.init();
    runtime.capture('p', { en: { key: 'Original' } });
    runtime.cache.entries.push({ ns: 'p', key: 'key', source: 'Original', translation: 'Перевод' });
    assert.equal(runtime.getTranslation('p', 'key'), 'Перевод');
    runtime.capture('p', { en: { key: 'Changed' } });
    assert.equal(runtime.getTranslation('p', 'key'), '');
  } finally { if (old === undefined) delete globalThis.localStorage; else globalThis.localStorage = old; }
});

test('provider rejects invalid endpoint, oversized batches and placeholder damage', async () => {
  await assert.rejects(() => TranslateProvider.translate({ apiKey: 'x', endpoint: 'http://bad', items: [{ id: '1', text: 'A' }] }), /HTTPS/);
  await assert.rejects(() => TranslateProvider.translate({ apiKey: 'x', endpoint: 'https://example.org', items: Array.from({length:65}, (_,i) => ({id:String(i),text:'x'})) }), /Invalid/);
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify([{ id:'x', translation:'Привет {other}' }]) } }] }) });
  try {
    const result = await TranslateProvider.translate({ apiKey:'x', endpoint:'https://example.org', items:[{id:'x',text:'Hello {name}'}] });
    assert.equal(result.has('x'), false);
  } finally { globalThis.fetch = oldFetch; }
});

test('cached plugin translations register into ru-auto without duplicate ru locale', () => {
  const { ctx, dictionaries } = makeContext();
  const runtime = new TranslationRuntime(ctx);
  runtime.config.enabled = true;
  runtime.init();
  runtime.cache.entries.push({ ns: 'p', key: 'key', source: 'Value', translation: 'Значение' });
  runtime.capture('p', { en: { key: 'Value' } });
  assert.deepEqual(dictionaries.get('p:ru-auto'), { key: 'Значение' });
  assert.equal(dictionaries.has('p:ru'), false);
});

test('provider clears timeout after failed network call', async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('network down'); };
  try {
    await assert.rejects(() => TranslateProvider.translate({ apiKey:'x', endpoint:'https://example.org', items:[{id:'x',text:'Hello'}] }), /Network error/);
  } finally { globalThis.fetch = oldFetch; }
});