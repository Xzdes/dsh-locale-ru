// Generate lib/client.js from translated dictionaries and embed lazy auto-translate runtime.
const fs = require('fs');
const path = require('path');
const R = process.argv[2];
const pluginDir = process.argv[3];
const src = JSON.parse(fs.readFileSync(path.join(R, 'namespaces.json'), 'utf8'));
const ru = {};
for (const f of fs.readdirSync(R)) {
  const m = /^ru-chunk-(\d+)\.json$/.exec(f);
  if (!m) continue;
  const chunk = JSON.parse(fs.readFileSync(path.join(R, f), 'utf8'));
  for (const [ns, dict] of Object.entries(chunk)) ru[ns] = Object.assign(ru[ns] || {}, dict);
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
    if (ruVal === undefined || ruVal === null || (ruVal === '' && enVal !== '')) { problems.push(`MISSING ${ns}.${key}`); ruVal = enVal; }
    if (typeof ruVal !== 'string') { problems.push(`NON-STR ${ns}.${key}`); ruVal = enVal; }
    const ph = (v) => [...v.matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort().join(',');
    if (ph(enVal) !== ph(ruVal)) { problems.push(`PLACEHOLDER ${ns}.${key}`); ruVal = enVal; }
    out[key] = ruVal;
  }
  finalRu[ns] = out;
}
for (const ns of Object.keys(ru)) if (!src[ns]) problems.push(`UNKNOWN NS ${ns}`);

const strip = (file, replacements) => {
  let s = fs.readFileSync(path.join(pluginDir, 'lib', file), 'utf8');
  s = s.replace(/^\/\*\*[\s\S]*?\*\//, '');
  for (const [a, b] of replacements) s = s.replace(a, b);
  return s;
};
const providerSource = strip('translate-provider.js', [[/export const TranslateProvider/g, 'const TranslateProvider']]);
const coreSource = strip('translate-core.js', [[/import \{ TranslateProvider \} from "\.\/translate-provider\.js";\s*/g, ''], [/export class TranslationRuntime/g, 'class TranslationRuntime']]);
const settingsSource = strip('auto-translate-settings.js', [[/import \{ TranslationRuntime \} from "\.\/translate-core\.js";\s*/g, ''], [/export const autoTranslateSettings/g, 'const autoTranslateSettings']]);
const indent = (s) => s.split('\n').map((line) => line.trim() ? `  ${line}` : '').join('\n');
const dictJson = JSON.stringify(finalRu, null, 2);
const clientJs = `/** dsh-locale-ru generated client bundle. */
window.__ModuleLoader__.load({
  id: "dsh-locale-ru",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    const inject = ["locale", "slots"];
    const RU = ${dictJson.split('\n').join('\n    ')};
    ${indent(providerSource)}
    ${indent(coreSource)}
    ${indent(settingsSource)}
    function apply(ctx) {
      ctx.effect(() => {
        try { return ctx.locale.addLanguage({ id: "ru", label: "Русский", fallback: "en" }); }
        catch { return void 0; }
      }, "dsh-locale-ru: language definition");
      for (const ns of Object.keys(RU)) {
        ctx.effect(() => ctx.locale.register(ns, "ru", RU[ns]), "dsh-locale-ru: " + ns + " dictionary");
      }
      // This row is registered without touching locale.register or configForms at boot.
      // The runtime itself starts only when the user expands the row.
      ctx.effect(() => {
        const runtime = new TranslationRuntime(ctx);
        const t = (key) => ({
          title: "Автоматический перевод плагинов",
          description: "Переводить отсутствующие строки интерфейса через выбранную модель."
        }[key] || key);
        return ctx.slots.inject("settings.general.item", () => ctx.slots.register({
          name: "settings.general.item",
          id: "dsh-locale-ru-auto-translate",
          order: 920,
          locale: "dsh-locale-ru-auto-translate"
        }, autoTranslateSettings.createRow({ runtime, t })));
      }, "dsh-locale-ru: auto-translate settings row");
    }
    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
`;
fs.mkdirSync(path.join(pluginDir, 'lib'), { recursive: true });
fs.writeFileSync(path.join(pluginDir, 'lib', 'client.js'), clientJs);
let totalKeys = 0;
for (const ns of Object.keys(finalRu)) totalKeys += Object.keys(finalRu[ns]).length;
console.log(`client.js written: ${clientJs.length} bytes, ${Object.keys(finalRu).length} namespaces, ${totalKeys} keys`);
if (problems.length) { console.log(`PROBLEMS (${problems.length}):`); problems.forEach((p) => console.log('  ' + p)); }
else console.log('Validation: all namespaces, keys and placeholders OK.');