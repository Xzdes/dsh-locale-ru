# Translation pipeline (tools/)

These scripts re-harvest the UI dictionaries from an installed DeepSeek Harness
and regenerate `lib/client.js`. They exist so the pack can be updated when a
new DSH version changes interface strings.

> The scripts were developed against DSH `0.2.0-rc.2` on Windows.
> Paths at the top of each script are examples — adjust them to your machine.

## Files

| File | Role |
|---|---|
| `asar.ps1` | Lists/extracts files from the app's `resources/app.asar` (DSH ships its packages packed there). Run with `powershell -ExecutionPolicy Bypass -File asar.ps1 -Pattern '<regex>'` or `-Extract <path> -Out <file>`. |
| `harvest.js` | Executes every extracted `dsh-client-*/lib/client.js` bundle in a mocked module loader and captures all `ctx.locale.register(ns, { zh, en })` calls → `namespaces.json`. |
| `extract-dict.js` | Static fallback for bundles that fail dynamic harvest (resolves `const` object literals, incl. spreads, via `vm`). |
| `generate-client.js` | Merges `ru-chunk-*.json` translations, validates coverage + `{placeholder}` parity against `namespaces.json`, and writes `lib/client.js`. |
| `namespaces.json` | Snapshot of every built-in `{ namespace → { en, zh } }` dictionary from DSH `0.2.0-rc.2`. |

## Update workflow for a new DSH version

1. Extract all client bundles from the new `app.asar` into a folder, e.g.
   `powershell -ExecutionPolicy Bypass -File asar.ps1 -Pattern '/lib/client\.js$'`
   then `-Extract` each into `bundles/`.
2. `node harvest.js <bundlesDir> namespaces.json` — fresh English source.
   Check the failure list; use `extract-dict.js` for bundles that resist
   dynamic execution.
3. Diff against the previous `namespaces.json` — new/changed keys are the
   translation delta.
4. Translate the delta into `ru-chunk-*.json` files (same
   `{ namespace: { key: "…" } }` shape).
5. `node generate-client.js <dir-with-chunks> <pluginRoot>` — validates and
   writes `lib/client.js`. `MISSING` / `PLACEHOLDER MISMATCH` lines fall back
   to English; fix them and re-run.
6. Bump `version` (and `engines.dsh` after testing), update the changelog.

## Translation rules used in this pack

- Keys and namespace names are never translated; `{placeholder}` variables are
  preserved byte-for-byte.
- Neutral tone («вы» implied); buttons and actions use the infinitive.
- Brand and protocol names stay untouched: DeepSeek, DSH, Cordis, pnpm, npm,
  GitHub, Markdown, JSON, YAML, API, URL, etc.
