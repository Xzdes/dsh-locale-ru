// Statically extract a locale dictionary from a bundle, resolving const variables recursively via vm.
// Usage: node tools/extract-dict.cjs <bundleFile> <registerCallIndex>
const fs = require('fs');
const vm = require('vm');
const code = fs.readFileSync(process.argv[2], 'utf8');
const wantIdx = parseInt(process.argv[3] || '0', 10);

function balancedObject(startIdx) {
  let depth = 0, j = startIdx, inStr = null, esc = false;
  for (; j < code.length; j++) {
    const c = code[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '/' && code[j + 1] === '/') { while (j < code.length && code[j] !== '\n') j++; continue; }
    if (c === '/' && code[j + 1] === '*') { j += 2; while (j < code.length && !(code[j] === '*' && code[j + 1] === '/')) j++; j++; continue; }
    if (c === '{') depth++;
    if (c === '}') { depth--; if (depth === 0) return code.slice(startIdx, j + 1); }
  }
  throw new Error('unbalanced');
}

const env = {};
function evalWithEnv(literal) {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      return vm.runInNewContext('(' + literal + ')', env, { timeout: 1000 });
    } catch (e) {
      const m = /(\w[\w$]*) is not defined/.exec(e.message);
      if (!m) throw e;
      env[m[1]] = resolveVar(m[1]);
    }
  }
  throw new Error('too many unresolved references');
}

function resolveVar(name) {
  if (name in env) return env[name];
  // const NAME = { ... }  |  const NAME = "..." | `...` | number
  const reObj = new RegExp('const\\s+' + name.replace(/\$/g, '\\$') + '\\s*=\\s*\\{');
  let m = reObj.exec(code);
  if (m) {
    const braceStart = code.indexOf('{', m.index + m[0].length - 1);
    return evalWithEnv(balancedObject(braceStart));
  }
  const reVal = new RegExp('const\\s+' + name.replace(/\$/g, '\\$') + '\\s*=\\s*(`(?:[^`\\\\]|\\\\.)*`|"(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\'|[\\d.]+)');
  m = reVal.exec(code);
  if (m) return evalWithEnv(m[1]);
  throw new Error('var not found: ' + name);
}

const re = /locale\.register\(\s*(("[^"]+")|[A-Za-z_$][\w$]*)\s*,\s*\{/g;
let m, i = -1;
while ((m = re.exec(code))) {
  i++;
  if (i !== wantIdx) continue;
  let nsArg = m[1];
  if (!nsArg.startsWith('"')) nsArg = JSON.stringify(resolveVar(nsArg));
  const braceStart = code.indexOf('{', m.index + m[0].length - 1);
  const literal = balancedObject(braceStart);
  const inner = literal.slice(1, -1);
  const entries = inner.split(',').map((s2) => s2.trim()).filter(Boolean);
  const dicts = {};
  for (const e of entries) {
    const parts = e.split(':').map((s2) => s2.trim());
    const lang = parts[0];
    const varName = parts.length > 1 ? parts[1] : parts[0];
    dicts[lang] = resolveVar(varName);
  }
  console.log(JSON.stringify({ nsArg: JSON.parse(nsArg), dicts }, null, 2));
  process.exit(0);
}
console.error('register call not found');
process.exit(1);
