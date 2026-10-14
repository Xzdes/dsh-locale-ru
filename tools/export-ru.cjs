// Reverse-extract the Russian dictionaries from the generated lib/client.js
// back into ru-chunk-*.json source files. This makes the translation source
// first-class and version-controlled, so generate-client.cjs can rebuild
// lib/client.js from scratch and the pack's build stays reproducible.
//
// Usage:
//   node tools/export-ru.cjs [chunkSize]
//
// Reads : lib/client.js (generated bundle)
//         tools/namespaces.json (harvested EN/ZH source)
// Writes: tools/ru-chunk-*.json
"use strict";

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RESEARCH_DIR = __dirname;
const CHUNK_SIZE = Number(process.argv[2]) || 10;

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

const clientJs = fs.readFileSync(path.join(ROOT, 'lib', 'client.js'), 'utf8');

// The generated bundle stores the dictionaries inline:
//     const RU = { … };       (JSON re-indented by two tabs)
//     /**
// JSON ignores the indentation, so the captured block parses directly once the
// trailing `;` is anchored against the following doc-comment.
const m = /const RU = ([\s\S]*?);\r?\n\t\t\/\*\*/.exec(clientJs);
if (!m) fail('could not locate `const RU = {...};` in lib/client.js');

let ru;
try {
  ru = JSON.parse(m[1]);
} catch (err) {
  fail(`RU block is not valid JSON: ${err.message}`);
}

const src = JSON.parse(
  fs.readFileSync(path.join(RESEARCH_DIR, 'namespaces.json'), 'utf8')
);

// Mirror generate-client.cjs validation so we can guarantee a lossless
// round-trip before regenerating.
const problems = [];
let totalKeys = 0;
const namespaces = Object.keys(ru).sort();
const placeholder = (s) =>
  [...s.matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort().join(',');

// 1. Namespaces in the bundle but absent from namespaces.json would be dropped.
for (const ns of namespaces) {
  if (!src[ns]) problems.push(`UNKNOWN namespace (not in namespaces.json): ${ns}`);
}

// 2. Namespaces in namespaces.json but absent from the bundle get EN fallback.
for (const ns of Object.keys(src)) {
  if (!ru[ns]) continue; // reported below per-key; keep placeholder check here too
}

for (const ns of namespaces) {
  const dict = ru[ns];
  totalKeys += Object.keys(dict).length;
  if (!src[ns]) continue;
  const en = src[ns].en || {};
  for (const [key, enVal] of Object.entries(en)) {
    if (typeof enVal !== 'string') continue;
    const value = dict[key];
    if (value === undefined || value === null || (value === '' && enVal !== '')) {
      problems.push(`missing key (EN fallback): ${ns}.${key}`);
      continue;
    }
    if (placeholder(enVal) !== placeholder(value)) {
      problems.push(`placeholder mismatch (EN fallback): ${ns}.${key}`);
    }
  }
  // 3. Extra keys not present in EN source would be silently dropped on regen.
  for (const key of Object.keys(dict)) {
    if (!(key in en)) problems.push(`extra key (dropped on regen): ${ns}.${key}`);
  }
}

// 4. src namespaces not covered by the bundle at all.
for (const ns of Object.keys(src)) {
  if (!ru[ns]) problems.push(`namespace missing from bundle: ${ns}`);
}

// Drop stale chunks, then write disjoint chunks (CHUNK_SIZE namespaces each).
for (const f of fs.readdirSync(RESEARCH_DIR)) {
  if (/^ru-chunk-\d+\.json$/.test(f)) fs.unlinkSync(path.join(RESEARCH_DIR, f));
}

const chunkCount = Math.max(1, Math.ceil(namespaces.length / CHUNK_SIZE));
for (let i = 0; i < chunkCount; i++) {
  const slice = namespaces.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
  const chunk = {};
  for (const ns of slice) chunk[ns] = ru[ns];
  const name = `ru-chunk-${String(i + 1).padStart(2, '0')}.json`;
  fs.writeFileSync(path.join(RESEARCH_DIR, name), JSON.stringify(chunk, null, 2) + '\n');
  console.log(`wrote ${name} (${slice.length} namespaces)`);
}

console.log(`\nnamespaces: ${namespaces.length} | keys: ${totalKeys} | chunks: ${chunkCount}`);
if (problems.length) {
  console.log(`\nPROBLEMS (${problems.length}):`);
  for (const p of problems) console.log(`  - ${p}`);
  process.exitCode = 1;
} else {
  console.log('validation: every EN key has a RU value with matching placeholders — round-trip is lossless.');
}