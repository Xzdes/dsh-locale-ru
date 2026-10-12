// Generate lib/client.js for dsh-locale-ru from translated ru-chunk-*.json files.
// Validates: namespace coverage, key coverage, placeholder preservation.
// Usage: node generate-client.js <researchDir> <pluginDir>
const fs = require('fs');
const path = require('path');

const R = process.argv[2];
const pluginDir = process.argv[3];
const src = JSON.parse(fs.readFileSync(path.join(R, 'namespaces.json'), 'utf8'));

// Merge all translated chunks
const ru = {};
for (const f of fs.readdirSync(R)) {
  const m = /^ru-chunk-(\d+)\.json$/.exec(f);
  if (!m) continue;
  const chunk = JSON.parse(fs.readFileSync(path.join(R, f), 'utf8'));
  for (const [ns, dict] of Object.entries(chunk)) {
    ru[ns] = Object.assign(ru[ns] || {}, dict);
  }
}

const problems = [];
const finalRu = {};
for (const [ns, dicts] of Object.entries(src)) {
  const en = dicts.en || {};
  const ruDict = ru[ns] || {};
  const out = {};
  for (const [key, enVal] of Object.entries(en)) {
    if (typeof enVal !== 'string') continue;
    let ruVal = ruDict[key];
    if (ruVal === undefined || ruVal === null || (ruVal === '' && enVal !== '')) {
      problems.push(`MISSING  ${ns}.${key} -> fallback to EN`);
      ruVal = enVal;
    }
    if (typeof ruVal !== 'string') {
      problems.push(`NON-STR  ${ns}.${key} -> fallback to EN`);
      ruVal = enVal;
    }
    // Placeholder check
    const enPh = [...enVal.matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort().join(',');
    const ruPh = [...ruVal.matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort().join(',');
    if (enPh !== ruPh) {
      problems.push(`PLACEHOLDER MISMATCH ${ns}.${key}: en={${enPh}} ru={${ruPh}} -> fallback to EN`);
      ruVal = enVal;
    }
    out[key] = ruVal;
  }
  finalRu[ns] = out;
}
// Extra namespaces that don't exist in source (subagent errors)
for (const ns of Object.keys(ru)) {
  if (!src[ns]) problems.push(`UNKNOWN NS in translation: ${ns}`);
}

const dictJson = JSON.stringify(finalRu, null, 2);
const clientJs = `/**
 * dsh-locale-ru — web client bundle.
 * Registers the Russian language and its dictionaries for every built-in
 * UI namespace. Hand-written in the DSH lazy-CJS bundle format; no build
 * step required.
 */
window.__ModuleLoader__.load({
\tid: "dsh-locale-ru",
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
\t\t/** Required service: the locale registry. */
\t\tconst inject = ["locale"];
\t\t/** Russian dictionaries, keyed by locale namespace. */
\t\tconst RU = ${dictJson.split('\n').join('\n\t\t')};
\t\t/**
\t\t * Register the Russian language definition and one dictionary per
\t\t * namespace as owned effects; dictionaries registered after the UI is
\t\t * mounted are picked up without a remount.
\t\t * @param ctx - Client root context.
\t\t */
\t\tfunction apply(ctx) {
\t\t\tctx.effect(() => {
\t\t\t\ttry {
\t\t\t\t\treturn ctx.locale.addLanguage({ id: "ru", label: "Русский", fallback: "en" });
\t\t\t\t} catch (err) {
\t\t\t\t\t// Already registered (e.g. after an HMR re-run) — keep going.
\t\t\t\t\treturn void 0;
\t\t\t\t}
\t\t\t}, "dsh-locale-ru: language definition");
\t\t\tfor (const ns of Object.keys(RU)) {
\t\t\t\tctx.effect(() => ctx.locale.register(ns, "ru", RU[ns]), "dsh-locale-ru: " + ns + " dictionary");
\t\t\t}
\t\t}
\t\texports.apply = apply;
\t\texports.inject = inject;
\t\treturn module.exports;
\t}
});
`;
fs.mkdirSync(path.join(pluginDir, 'lib'), { recursive: true });
fs.writeFileSync(path.join(pluginDir, 'lib', 'client.js'), clientJs);

let totalKeys = 0;
for (const ns of Object.keys(finalRu)) totalKeys += Object.keys(finalRu[ns]).length;
console.log(`client.js written: ${clientJs.length} bytes, ${Object.keys(finalRu).length} namespaces, ${totalKeys} keys`);
if (problems.length) {
  console.log(`\nPROBLEMS (${problems.length}):`);
  problems.forEach((p) => console.log('  ' + p));
} else {
  console.log('Validation: all namespaces, keys and placeholders OK.');
}
