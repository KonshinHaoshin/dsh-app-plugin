window.__ModuleLoader__.load({id:"@shelterhub/dsh-mobile-bridge",factory:(require)=>{var module={exports:{}};var exports=module.exports;
"use strict";

// client-entry.cjs
var React = require("react");
var h = React.createElement;
var CSS = `.dsh-mobile-settings{max-width:620px;color:var(--dsw-alias-label-primary,#262626);font-size:14px;line-height:1.7}.dsh-mobile-settings h2{font-size:20px;font-weight:600;margin:0 0 18px}.dsh-mobile-settings h3{font-size:14px;margin:22px 0 12px}.dsh-mobile-settings button,.dsh-mobile-settings input{font:inherit}.dsh-mobile-settings button{cursor:pointer;min-height:38px;border:1px solid #dce3ef;background:#fff;color:#39445c;border-radius:7px;padding:6px 14px}.dsh-mobile-settings button:disabled{opacity:.5;cursor:default}.dsh-mobile-settings .primary{background:#4d6bfe;color:#fff;border-color:#4d6bfe}.dsh-mobile-settings .modes{display:flex;gap:8px}.dsh-mobile-settings .modes .selected{color:#4d6bfe;border-color:#4d6bfe;background:#eff3ff}.dsh-mobile-settings .summary{display:flex;flex-wrap:wrap;gap:12px;color:#6b7280;font-size:12px;margin-bottom:18px}.dsh-mobile-settings .summary b{font-weight:500;color:#4d6bfe}.dsh-mobile-settings .pairing{border:1px solid #e6ebf3;background:#fafcff;border-radius:12px;padding:20px;margin:12px 0 18px;display:flex;align-items:center;gap:22px}.dsh-mobile-settings .qr{width:220px;flex-shrink:0;max-width:55%;background:white;border-radius:8px}.dsh-mobile-settings .qr svg{width:100%;height:auto;display:block}.dsh-mobile-settings .pair-actions{font-size:12px;color:#6b7280}.dsh-mobile-settings .pair-actions button{display:block;margin-top:10px;font-size:12px}.dsh-mobile-settings .hint{font-size:12px;color:#6b7280}.dsh-mobile-settings .error{color:#b4332c;font-size:12px;margin:10px 0}.dsh-mobile-settings .success{color:#375eca;font-size:12px;margin:10px 0}.dsh-mobile-settings .config{border-top:1px solid #e5e9f0;padding-top:14px;margin-top:22px}.dsh-mobile-settings .config summary{cursor:pointer;font-weight:500}.dsh-mobile-settings .fields{display:grid;grid-template-columns:110px minmax(0,1fr);gap:12px;align-items:center;margin:18px 0}.dsh-mobile-settings input:not([type=checkbox]){background:var(--dsw-alias-bg-input,#fff);color:inherit;border:1px solid #dce3ef;border-radius:6px;padding:7px 10px;min-height:38px;width:100%;box-sizing:border-box}.dsh-mobile-settings input[readonly]{color:#6b7280;background:#f7f9fc}.dsh-mobile-settings label{font-size:12px}.dsh-mobile-settings .check{display:flex;gap:8px;align-items:center}.dsh-mobile-settings .footer{display:flex;gap:12px;align-items:center}.dsh-mobile-settings :focus-visible{outline:2px solid #4d6bfe;outline-offset:2px}@media(max-width:600px){.dsh-mobile-settings .pairing{display:block}.dsh-mobile-settings .qr{max-width:100%;margin:0 auto}.dsh-mobile-settings .pair-actions{text-align:center}.dsh-mobile-settings .pair-actions button{display:inline-block;margin:10px 4px}.dsh-mobile-settings .fields{grid-template-columns:1fr;gap:6px}}`;
async function rpc(action, params = {}) {
  const response = await fetch("api/mobile-bridge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...params }) });
  const value = await response.json();
  if (!response.ok || !value.ok) throw new Error(value.error || "\u624B\u673A\u8FDE\u63A5\u670D\u52A1\u6682\u65F6\u4E0D\u53EF\u7528");
  return value.value;
}
function Settings() {
  const [status, setStatus] = React.useState(null), [form, setForm] = React.useState(null), [pair, setPair] = React.useState(null), [mode, setMode] = React.useState("public"), [error, setError] = React.useState(""), [notice, setNotice] = React.useState(""), [busy, setBusy] = React.useState(false), [pairState, setPairState] = React.useState("");
  async function refreshPair(next = mode) {
    setError("");
    setBusy(true);
    setPairState("");
    try {
      setPair(await rpc("pair", { mode: next }));
    } catch (e) {
      setPair(null);
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  React.useEffect(() => {
    let disposed = false;
    void rpc("status").then((value) => {
      if (disposed) return;
      setStatus(value);
      setForm({ ...value, relaySecret: "" });
      const initial = value.relayUrl ? "public" : "lan";
      setMode(initial);
      if (value.relayUrl || value.lanEnabled) void refreshPair(initial);
      else setNotice("\u542F\u7528\u5C40\u57DF\u7F51\u8FDE\u63A5\uFF0C\u6216\u586B\u5199\u516C\u7F51\u914D\u7F6E\u540E\u4FDD\u5B58");
    }).catch((e) => {
      if (!disposed) setError(e.message);
    });
    return () => {
      disposed = true;
    };
  }, []);
  React.useEffect(() => {
    let disposed = false;
    const timer = setInterval(() => {
      void rpc("status").then((value) => {
        if (!disposed) setStatus(value);
      }).catch(() => {
      });
    }, 2e3);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, []);
  React.useEffect(() => {
    if (!pair) return;
    let disposed = false;
    const timer = setInterval(() => {
      void rpc("pairStatus", { id: pair.id }).then((value) => {
        if (disposed) return;
        setPairState(value.used ? "\u5DF2\u914D\u5BF9" : value.expired || Date.now() > pair.expiresAt ? "\u914D\u5BF9\u7801\u5DF2\u8FC7\u671F" : "");
      }).catch(() => {
      });
    }, 2e3);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [pair]);
  const field = (key, value) => setForm((previous) => ({ ...previous, [key]: value }));
  async function save(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await rpc("save", { value: { name: form.name, lanEnabled: form.lanEnabled, port: Number(form.port), relayUrl: form.relayUrl, relaySecret: form.relaySecret } });
      setNotice("\u914D\u7F6E\u5DF2\u4FDD\u5B58");
      const latest = await rpc("status");
      setStatus(latest);
      setForm({ ...latest, relaySecret: "" });
      setPair(null);
    } catch (e2) {
      setError(e2.message);
    } finally {
      setBusy(false);
    }
  }
  return h(
    "div",
    { className: "dsh-mobile-settings" },
    h("h2", null, "\u624B\u673A\u8FDE\u63A5"),
    status && h("div", { className: "summary" }, h("span", null, "\u8BBE\u5907\uFF1A", h("b", null, status.name)), h("span", null, "\u516C\u7F51\uFF1A", h("b", null, status.relayConnected ? "\u5DF2\u8FDE\u63A5" : status.relayUrl ? "\u672A\u8FDE\u63A5" : "\u672A\u542F\u7528")), h("span", null, "\u5C40\u57DF\u7F51\uFF1A", h("b", null, status.lanEnabled ? "\u5DF2\u542F\u7528" : "\u672A\u542F\u7528")), h("span", null, "\u624B\u673A\uFF1A", h("b", null, status.activeConnections))),
    h("div", { className: "modes" }, ...["public", "lan"].map((value) => h("button", { key: value, type: "button", className: mode === value ? "selected" : "", disabled: busy, onClick: () => {
      setMode(value);
      void refreshPair(value);
    } }, value === "public" ? "\u516C\u7F51\u914D\u5BF9" : "\u5C40\u57DF\u7F51\u914D\u5BF9"))),
    pair && h("div", { className: "pairing" }, h("div", { className: "qr", style: pairState ? { opacity: 0.25 } : void 0, dangerouslySetInnerHTML: { __html: pair.svg } }), h("div", { className: "pair-actions" }, h("strong", null, "\u624B\u673A DSH \u2192 \u626B\u4E00\u626B"), h("p", null, pairState || "5 \u5206\u949F\u5185\u6709\u6548\uFF0C\u4EC5\u53EF\u4F7F\u7528\u4E00\u6B21"), h("button", { disabled: busy, onClick: () => void refreshPair() }, "\u5237\u65B0\u4E8C\u7EF4\u7801"), h("button", { onClick: () => navigator.clipboard.writeText(pair.uri).then(() => setNotice("\u914D\u5BF9\u94FE\u63A5\u5DF2\u590D\u5236")).catch(() => setError("\u65E0\u6CD5\u8BBF\u95EE\u526A\u8D34\u677F")) }, "\u590D\u5236\u914D\u5BF9\u94FE\u63A5"))),
    !pair && status && (status.relayUrl || status.lanEnabled) && h("button", { type: "button", disabled: busy, onClick: () => void refreshPair() }, busy ? "\u6B63\u5728\u52A0\u8F7D\u2026" : "\u751F\u6210\u4E8C\u7EF4\u7801"),
    error && h("div", { className: "error", role: "alert" }, error),
    notice && h("div", { className: "success", role: "status" }, notice),
    form && h("details", { className: "config", open: !status.lanEnabled && !status.relayUrl ? true : void 0 }, h("summary", null, "\u8FDE\u63A5\u914D\u7F6E"), h("form", { onSubmit: save }, h(
      "div",
      { className: "fields" },
      h("label", { htmlFor: "dsh-mobile-name" }, "\u8BBE\u5907\u540D\u79F0"),
      h("input", { id: "dsh-mobile-name", value: form.name, maxLength: 80, onChange: (e) => field("name", e.target.value), required: true }),
      h("label", { htmlFor: "dsh-mobile-id" }, "\u8BBE\u5907 ID"),
      h("input", { id: "dsh-mobile-id", value: form.deviceId, readOnly: true }),
      h("label", { htmlFor: "dsh-mobile-lan" }, "\u5C40\u57DF\u7F51\u8FDE\u63A5"),
      h("label", { className: "check" }, h("input", { id: "dsh-mobile-lan", type: "checkbox", checked: form.lanEnabled, onChange: (e) => field("lanEnabled", e.target.checked) }), "\u5141\u8BB8\u540C\u4E00\u7F51\u7EDC\u4E2D\u7684\u624B\u673A\u914D\u5BF9"),
      h("label", { htmlFor: "dsh-mobile-port" }, "\u76D1\u542C\u7AEF\u53E3"),
      h("input", { id: "dsh-mobile-port", type: "number", min: 1024, max: 65535, value: form.port, onChange: (e) => field("port", e.target.value), required: true }),
      h("label", { htmlFor: "dsh-mobile-relay" }, "\u516C\u7F51\u670D\u52A1\u5668"),
      h("input", { id: "dsh-mobile-relay", type: "url", value: form.relayUrl, placeholder: "wss://dshapi.shelterhub.moe/connect", onChange: (e) => field("relayUrl", e.target.value) }),
      h("label", { htmlFor: "dsh-mobile-secret" }, "\u4E2D\u7EE7\u8BA4\u8BC1\u5BC6\u94A5"),
      h("input", { id: "dsh-mobile-secret", type: "password", value: form.relaySecret, autoComplete: "new-password", placeholder: form.relayConfigured ? "\u5DF2\u914D\u7F6E\uFF0C\u7559\u7A7A\u4FDD\u7559" : "\u4EC5\u7535\u8111\u7AEF\u9700\u8981\u914D\u7F6E", onChange: (e) => field("relaySecret", e.target.value) })
    ), h("div", { className: "footer" }, h("button", { type: "submit", className: "primary", disabled: busy || !status.editable }, busy ? "\u6B63\u5728\u4FDD\u5B58\u2026" : "\u4FDD\u5B58\u914D\u7F6E"), h("span", { className: "hint" }, "\u4FDD\u5B58\u540E\u4F1A\u91CD\u65B0\u5EFA\u7ACB\u624B\u673A\u8FDE\u63A5"))))
  );
}
function apply(ctx) {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
  ctx.effect(() => () => style.remove(), "mobile settings styles");
  ctx.effect(() => ctx.slots.inject("settings.section", () => ctx.slots.register({ name: "settings.section", id: "shelterhub-mobile", order: 70, label: () => "\u624B\u673A\u8FDE\u63A5" }, Settings)), "mobile settings section");
}
var inject = ["slots", "connection"];
module.exports = { apply, inject };

return module.exports;}});
