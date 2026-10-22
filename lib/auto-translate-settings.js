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

    useEffect(() => runtime.subscribe(() => setSnap(runtime.getSnapshot())), []);
    useEffect(() => { runtime.init(); return () => runtime.stop(); }, []);

    const onTranslate = async () => {
      setStatus("Перевод…");
      try {
        const r = await runtime.translateMissing();
        setStatus(`Готово: ${r.translated} новых. Осталось: ${r.pending}`);
      } catch (e) {
        setStatus(e.message);
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
            value: snap.model || "",
            onChange: (e) => runtime.updateConfig({ model: e.target.value }),
            style: { padding: "6px 8px", fontSize: "13px" }
          })
        ),
        React.createElement("label", { style: { display: "flex", flexDirection: "column", gap: "4px" } },
          React.createElement("span", null, "API endpoint"),
          React.createElement("input", {
            value: snap.endpoint || "",
            onChange: (e) => runtime.updateConfig({ endpoint: e.target.value }),
            style: { padding: "6px 8px", fontSize: "13px" }
          })
        ),
        React.createElement("label", { style: { display: "flex", flexDirection: "column", gap: "4px" } },
          React.createElement("span", null, "API-ключ"),
          React.createElement("input", {
            type: "password",
            placeholder: "sk-...",
            value: snap.apiKey || "",
            onChange: (e) => runtime.updateConfig({ apiKey: e.target.value }),
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
          disabled: !snap.configured || !snap.pending || snap.scanning,
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