// Harvest locale dictionaries from compiled DSH client bundles. v2
// Usage: node harvest.js <bundlesDir> <outJson>
const fs = require('fs');
const path = require('path');

const dir = process.argv[2];
const outFile = process.argv[3];
const out = {};
const failures = [];

process.on('unhandledRejection', (e) => {
  failures.push(`UNHANDLED REJECTION: ${e && e.message}`);
});

function deepStub() {
  const f = function () { return p; };
  const p = new Proxy(f, {
    get(t, k) {
      if (k === Symbol.iterator) return function* () {};
      if (k === Symbol.toPrimitive) return () => '';
      if (k === Symbol.toStringTag) return 'Stub';
      if (typeof k === 'symbol') return undefined;
      if (k === 'then') return undefined;
      if (k === 'length') return 0;
      if (k === 'current') return null;
      return p;
    },
    apply() { return p; },
    construct() { return p; },
  });
  return p;
}

const s = deepStub();
const reactStub = {
  memo: (x) => x,
  forwardRef: (x) => x,
  createElement: () => s,
  cloneElement: () => s,
  createContext: () => ({ Provider: s, Consumer: s, displayName: '' }),
  createRef: () => ({ current: null }),
  Fragment: 'Fragment',
  StrictMode: 'StrictMode',
  Suspense: 'Suspense',
  lazy: () => s,
  useState: (v) => [v, () => {}],
  useEffect: () => {},
  useLayoutEffect: () => {},
  useMemo: (f) => { try { return f(); } catch { return s; } },
  useCallback: (f) => f,
  useRef: (v) => ({ current: v ?? null }),
  useContext: () => s,
  useReducer: (r, v) => [v, () => {}],
  useSyncExternalStore: (sub, get) => { try { return get(); } catch { return s; } },
  useId: () => 'stub-id',
  Children: { map: () => [], forEach: () => {}, count: () => 0, toArray: () => [] },
  isValidElement: () => false,
  version: '18.3.1',
};

function makeRequire() {
  return (name) => {
    if (name === 'react') return reactStub;
    if (name === 'react/jsx-runtime') return { jsx: () => s, jsxs: () => s, Fragment: 'Fragment' };
    if (name === 'react-dom' || name === 'react-dom/client') return { createPortal: () => s, flushSync: (f) => (typeof f === 'function' ? f() : s), createRoot: () => s };
    return deepStub();
  };
}

async function run() {
  for (const file of fs.readdirSync(dir).sort()) {
    if (!file.endsWith('.js')) continue;
    const code = fs.readFileSync(path.join(dir, file), 'utf8');
    let loaded = null;
    global.window = { __ModuleLoader__: { load(def) { loaded = def; } } };
    try { eval(code); } catch (e) { failures.push(`${file}: EVAL: ${e.message}`); continue; }
    if (!loaded) { failures.push(`${file}: no __ModuleLoader__.load call`); continue; }
    let exports_;
    try { exports_ = loaded.factory(makeRequire()); } catch (e) { failures.push(`${file}: FACTORY: ${e.message}`); continue; }
    if (!exports_ || typeof exports_.apply !== 'function') continue;
    const regs = [];
    const localeSvc = {
      register(ns, a, b) { regs.push({ ns, a, b }); return () => {}; },
      bind(ns) { const t = (k) => k; t.raw = (k) => k; return t; },
      getSnapshot() { return { revision: 0, active: 'en', selectable: [] }; },
      addLanguage() { return () => {}; },
      resolveText(t) { return typeof t === 'string' ? t : (t && t.en) || ''; },
      subscribe() { return () => {}; },
    };
    const ctx = new Proxy({}, {
      get(t, k) {
        if (typeof k === 'symbol') return undefined;
        if (k === 'locale') return localeSvc;
        if (k === 'effect') return (fn) => { try { return fn(); } catch (e) { failures.push(`${file}: EFFECT: ${e.message}`); return () => {}; } };
        if (k === 'on' || k === 'once') return () => () => {};
        return deepStub();
      },
    });
    try {
      const res = exports_.apply(ctx);
      if (res && typeof res.then === 'function') await res.catch((e) => failures.push(`${file}: APPLY-ASYNC: ${e.message}`));
    } catch (e) {
      failures.push(`${file}: APPLY: ${e.message}`);
    }
    for (const r of regs) {
      const dicts = typeof r.a === 'string' ? { [r.a]: r.b } : r.a;
      for (const [lang, dict] of Object.entries(dicts || {})) {
        if (!dict || typeof dict !== 'object') continue;
        out[r.ns] = out[r.ns] || {};
        out[r.ns][lang] = Object.assign(out[r.ns][lang] || {}, dict);
      }
    }
    if (regs.length > 0) console.log(`${file}: ${regs.map((r) => r.ns).join(', ')}`);
  }

  fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
  let totalKeys = 0;
  for (const ns of Object.keys(out)) totalKeys += Object.keys(out[ns].en || {}).length;
  console.log(`\nNamespaces: ${Object.keys(out).length}, total EN keys: ${totalKeys}`);
  if (failures.length) { console.log('\nFailures:'); failures.forEach((f) => console.log('  ' + f)); }
}
run();
