/**
 * Settings row for automatic translation — lazy-loaded and safe.
 * Registered through settings.general.item slot when user opens settings.
 */
import { TranslationRuntime } from "./translate-core.js";

let React;
try { React = require("react"); } catch { React = null; }

function createAutoTranslateRow({ runtime, t }) {
  if (!React) return null;
  const { useState, useEffect } = React;

  return function AutoTranslateRow() {
    const [snap, setSnap] = useState(runtime.getSnapshot());
    const [status, setStatus] = useState("");
    const [expanded, setExpanded] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [modelDraft, setModelDraft] = useState(runtime.config.model || "");
    const [endpointDraft, setEndpointDraft] = useState(runtime.config.endpoint || "");
    const [apiKeyDraft, setApiKeyDraft] = useState(runtime.config.apiKey || "");
    const [batchSizeDraft, setBatchSizeDraft] = useState(String(runtime.config.batchSize || 24));

    useEffect(() => runtime.subscribe(() => setSnap(runtime.getSnapshot())), [runtime]);
    useEffect(() => { runtime.init(); }, [runtime]);

    const onTranslate = async () => {
      if (scanning) return;
      setScanning(true);
      setStatus("Перевод…");
      try {
        runtime.updateConfig({ model: modelDraft, endpoint: endpointDraft, apiKey: apiKeyDraft, batchSize: Number(batchSizeDraft) });
        const r = await runtime.translateMissing();
        const detail = r.errors?.length ? ` Ошибок: ${r.errors.length}.` : "";
        setStatus(`Готово: ${r.translated} новых. Осталось: ${r.pending}.${detail}`);
      } catch (e) {
        setStatus(e?.message || String(e));
      } finally {
        setScanning(false);
      }
    };

    return React.createElement("div", { style: { padding: "12px 0", borderBottom: "1px solid var(--dsw-alias-border-l2)" } },
      React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" } },
        React.createElement("div", null,
          React.createElement("strong", null, t("title")),
          React.createElement("div", { style: { color: "var(--dsw-alias-label-secondary)", fontSize: "12px", marginTop: "4px" } }, t("description"))
        ),
        React.createElement("button", {
          onClick: () => setExpanded(!expanded),
          style: { padding: "4px 12px", fontSize: "12px" }
        }, expanded ? "Свернуть" : "Настроить")
      ),
      expanded && React.createElement("div", { style: { marginTop: "16px", display: "flex", flexDirection: "column", gap: "12px" } },
        React.createElement("label", { style: { display: "flex", flexDirection: "column", gap: "4px" } },
          React.createElement("span", null, "Модель"),
          React.createElement("input", {
            value: modelDraft,
            onChange: (e) => setModelDraft(e.target.value),
            onBlur: () => runtime.updateConfig({ model: modelDraft }),
            style: { padding: "6px 8px", fontSize: "13px" }
          })
        ),
        React.createElement("label", { style: { display: "flex", flexDirection: "column", gap: "4px" } },
          React.createElement("span", null, "API endpoint"),
          React.createElement("input", {
            value: endpointDraft,
            onChange: (e) => setEndpointDraft(e.target.value),
            onBlur: () => runtime.updateConfig({ endpoint: endpointDraft }),
            style: { padding: "6px 8px", fontSize: "13px" }
          })
        ),
        React.createElement("label", { style: { display: "flex", flexDirection: "column", gap: "4px" } },
          React.createElement("span", null, "Размер пакета (1–64)"),
          React.createElement("input", {
            type: "number",
            min: 1,
            max: 64,
            value: batchSizeDraft,
            onChange: (e) => setBatchSizeDraft(e.target.value),
            onBlur: () => runtime.updateConfig({ batchSize: Number(batchSizeDraft) }),
            style: { padding: "6px 8px", fontSize: "13px" }
          })
        ),
        React.createElement("label", { style: { display: "flex", flexDirection: "column", gap: "4px" } },
          React.createElement("span", null, "API-ключ"),
          React.createElement("input", {
            type: "password",
            placeholder: "sk-...",
            value: apiKeyDraft,
            onChange: (e) => setApiKeyDraft(e.target.value),
            onBlur: () => runtime.updateConfig({ apiKey: apiKeyDraft }),
            style: { padding: "6px 8px", fontSize: "13px" }
          })
        ),
        React.createElement("label", { style: { display: "flex", alignItems: "center", gap: "8px" } },
          React.createElement("input", {
            type: "checkbox",
            checked: snap.enabled,
            onChange: (e) => runtime.updateConfig({ enabled: e.target.checked })
          }),
          "Включить автоперевод"
        ),
        React.createElement("div", { style: { color: "var(--dsw-alias-label-secondary)", fontSize: "12px" } },
          `Словарей: ${snap.namespaces}; строк: ${snap.strings}; переведено: ${snap.translated}; осталось: ${snap.pending}`
        ),
        React.createElement("button", {
          disabled: !snap.configured || !snap.pending || scanning,
          onClick: onTranslate,
          style: { padding: "8px 16px", alignSelf: "flex-start" }
        }, "Перевести новые строки"),
        status && React.createElement("div", { style: { color: status.startsWith("Готово") ? "var(--dsw-alias-success)" : "var(--dsw-alias-error)" } }, status)
      )
    );
  };
}

export const autoTranslateSettings = {
  name: "dsh-locale-ru.auto-translate",
  id: "auto-translate",
  order: 920,
  locale: "dsh-locale-ru.auto-translate",
  createRow: createAutoTranslateRow,
};