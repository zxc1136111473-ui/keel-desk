window.__ModuleLoader__.load({ id: "@deepseek-ai/dsh-desktop-manager", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// desktop-plugins/dsh-manager/src/client.tsx
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(client_exports);
var import_react = require("react");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

// desktop-plugins/dsh-manager/src/client.css
var client_default = "/* \u684C\u9762\u7BA1\u7406\u9875\u6837\u5F0F\u3002\n   \u53EA\u4F7F\u7528 ui-theme \u771F\u5B9E\u5B9A\u4E49\u7684 --dsw-* \u8BED\u4E49\u4EE4\u724C\uFF1A\u6DF1\u6D45\u4E3B\u9898\u5207\u6362\u65F6\u81EA\u52A8\u7FFB\u8F6C\uFF0C\n   \u4E0D\u51FA\u73B0\u4EFB\u4F55\u5B57\u9762\u8272\u503C\u3002\u547D\u540D\u7EDF\u4E00\u52A0 dsm- \u524D\u7F00\uFF0C\u907F\u514D\u4E0E\u5BBF\u4E3B\u6837\u5F0F\u76F8\u649E\u3002 */\n\n.dsm-root {\n  display: flex;\n  height: 100%;\n  flex-direction: column;\n  gap: 20px;\n  padding: 4px 2px;\n}\n\n.dsm-head h2 {\n  margin: 0 0 6px;\n  color: var(--dsw-alias-label-primary);\n  font-size: 18px;\n  font-weight: 650;\n  letter-spacing: -.01em;\n}\n\n.dsm-head p {\n  margin: 0;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 13px;\n  line-height: 1.6;\n}\n\n.dsm-list {\n  display: grid;\n  gap: 10px;\n}\n\n/* \u63D2\u4EF6\u5361\u7247\uFF1A\u4E0E\u8BBE\u7F6E\u9762\u677F\u5176\u5B83\u533A\u5757\u540C\u4E00\u5957\u5706\u89D2\u4E0E\u63CF\u8FB9\u8282\u594F\u3002 */\n.dsm-card {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 16px;\n  padding: 14px 16px;\n  border: 1px solid var(--dsw-alias-border-l1);\n  border-radius: 12px;\n  background: var(--dsw-alias-bg-layer-1);\n}\n\n.dsm-card-main {\n  display: flex;\n  min-width: 0;\n  flex-direction: column;\n  gap: 5px;\n}\n\n.dsm-card-title {\n  color: var(--dsw-alias-label-primary);\n  font-size: 14px;\n  font-weight: 600;\n}\n\n.dsm-card-id {\n  margin-left: 6px;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 12px;\n  font-weight: 400;\n}\n\n/* \u72B6\u6001\u884C\u7528 StateDot \u7EC4\u4EF6\u8868\u8FBE\u8BED\u4E49\u8272\uFF0C\u4E0D\u7528\u5F69\u8272\u6587\u5B57\u3001\u66F4\u4E0D\u7528\u8868\u60C5\u3002 */\n.dsm-state {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 12px;\n}\n\n.dsm-actions {\n  display: flex;\n  flex: none;\n  flex-wrap: wrap;\n  gap: 8px;\n}\n\n.dsm-action-group {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 8px;\n}\n\n.dsm-action-group + .dsm-action-group {\n  padding-left: 12px;\n  border-left: 1px solid var(--dsw-alias-border-l1);\n}\n\n@media (max-width: 560px) {\n  .dsm-action-group + .dsm-action-group {\n    padding-left: 0;\n    border-left: 0;\n  }\n}\n\n.dsm-logs {\n  display: flex;\n  min-height: 0;\n  flex: 1;\n  flex-direction: column;\n  gap: 8px;\n}\n\n/* \u5B89\u88C5/\u542F\u52A8\u8FDB\u5EA6\u6761\uFF1A\u767E\u5206\u6BD4 + \u6B65\u9AA4 + \u9884\u8BA1\u8017\u65F6\u3002 */\n.dsm-progress {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n  padding: 10px 12px;\n  border: 1px solid var(--dsw-alias-border-l1);\n  border-radius: 10px;\n  background: var(--dsw-alias-bg-layer-2);\n}\n\n.dsm-progress-bar {\n  height: 8px;\n  overflow: hidden;\n  border-radius: 999px;\n  background: var(--dsw-alias-bg-layer-3);\n}\n\n.dsm-progress-fill {\n  height: 100%;\n  border-radius: 999px;\n  background: var(--dsw-alias-accent, var(--dsw-alias-label-primary));\n  transition: width 0.4s ease;\n}\n\n.dsm-progress-meta {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 8px;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 12px;\n}\n\n.dsm-progress-label {\n  min-width: 0;\n  flex: 1;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.dsm-progress-pct {\n  color: var(--dsw-alias-label-primary);\n  font-weight: 600;\n  font-variant-numeric: tabular-nums;\n}\n\n.dsm-progress-eta {\n  white-space: nowrap;\n}\n\n.dsm-logs-head {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  color: var(--dsw-alias-label-primary);\n  font-size: 13px;\n  font-weight: 560;\n}\n\n.dsm-logs-running {\n  color: var(--dsw-alias-label-secondary);\n  font-size: 12px;\n  font-weight: 400;\n}\n\n.dsm-terminal {\n  min-height: 200px;\n  flex: 1;\n}\n\n.dsm-apply-row {\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n}\n\n/* \u63D0\u793A\u533A\uFF1A\u9760\u7559\u767D\u4E0E\u5C42\u6B21\u533A\u5206\uFF0C\u4E0D\u753B\u5DE6\u4FA7\u7AD6\u7EBF\u3002 */\n.dsm-note {\n  margin: 0;\n  padding: 11px 13px;\n  border: 1px solid var(--dsw-alias-border-l1);\n  border-radius: 10px;\n  color: var(--dsw-alias-label-secondary);\n  background: var(--dsw-alias-bg-layer-2);\n  font-size: 12px;\n  line-height: 1.65;\n}\n\n/* \u91CD\u542F\u63D0\u793A\uFF1A\u6587\u6848\u4E0E\u6309\u94AE\u540C\u884C\uFF0C\u6309\u94AE\u4FDD\u6301\u666E\u901A\u5C3A\u5BF8\u9760\u53F3\uFF0C\u4E0D\u5360\u6EE1\u5BBD\u5EA6\u3002 */\n.dsm-apply-note {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n}\n\n.dsm-apply-note > span {\n  min-width: 0;\n}\n\n.dsm-apply-note :global(button) {\n  flex: none;\n  white-space: nowrap;\n}\n\n.dsm-empty {\n  padding: 40px 0;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 13px;\n  text-align: center;\n}\n\n/* ---- \u51B7\u5496\u5561\u4E94\u6A21\u578B\u5DE5\u4F5C\u53F0\uFF1Aprofile \u5361\u7247 ---- */\n.dsm-hub {\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n}\n\n.dsm-hub-head {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 12px;\n}\n\n.dsm-card-sub {\n  color: var(--dsw-alias-label-secondary);\n  font-size: 12px;\n  line-height: 1.5;\n}\n\n/* \u51B7\u5496\u5561\u63D2\u4EF6\u7684\u9879\u76EE\u5730\u5740\uFF1A\u4F4E\u8C03\u53EF\u70B9\uFF0Chover \u63D0\u4EAE\u3002 */\n.dsm-card-link {\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11px;\n  line-height: 1.5;\n  text-decoration: none;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.dsm-card-link:hover {\n  color: var(--dsw-alias-brand-primary);\n  text-decoration: underline;\n}\n\n.dsm-card-patterns {\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11px;\n  line-height: 1.5;\n}\n\n.dsm-card-side {\n  display: flex;\n  flex: none;\n  flex-direction: column;\n  align-items: flex-end;\n  gap: 8px;\n}\n\n/* Reverify\uFF1A\u6574\u5361\u6539\u6210\u300C\u72B6\u6001 \u2192 \u6E05\u5355 \u2192 \u7F3A\u4EF6\u624D\u51FA\u6309\u94AE\u300D\uFF0C\u907F\u514D\u53F3\u4E0A\u89D2\u6C38\u8FDC\u6302\u7740\u5B89\u88C5\u3002 */\n.dsm-card-stack {\n  flex-direction: column;\n  align-items: stretch;\n  gap: 12px;\n}\n\n.dsm-card-stack .dsm-actions {\n  justify-content: flex-end;\n}\n\n.dsm-cap-list {\n  display: grid;\n  gap: 6px;\n  margin: 0;\n  padding: 0;\n  list-style: none;\n}\n\n.dsm-cap {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding: 8px 10px;\n  border-radius: 8px;\n  background: var(--dsw-alias-bg-layer-2);\n}\n\n.dsm-cap-body {\n  display: flex;\n  min-width: 0;\n  flex: 1;\n  flex-direction: column;\n  gap: 2px;\n}\n\n.dsm-cap-name {\n  color: var(--dsw-alias-label-primary);\n  font-size: 12px;\n  font-weight: 600;\n}\n\n.dsm-cap-note {\n  color: var(--dsw-alias-label-secondary);\n  font-size: 11px;\n  line-height: 1.4;\n}\n\n.dsm-cap-mark {\n  flex: none;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11px;\n}\n\n.dsm-cap-mark[data-on] {\n  color: var(--dsw-alias-label-primary);\n}\n\n/* ---- \u8F93\u5165\u6846\u91CC\u7684\u51B7\u5496\u5561\u7834\u7532\u5F00\u5173\uFF08conversation.input.left\uFF09 ---- */\n.dsm-composer-toggle {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  min-width: 0;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 12px;\n  line-height: 18px;\n  white-space: nowrap;\n}\n\n.dsm-composer-toggle[data-on] {\n  color: var(--dsw-alias-label-primary);\n}\n\n.dsm-toggle-switch {\n  position: relative;\n  box-sizing: border-box;\n  width: 30px;\n  height: 18px;\n  padding: 0;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 999px;\n  background: var(--dsw-alias-bg-layer-3);\n  cursor: pointer;\n  transition: background-color .18s ease, border-color .18s ease;\n  flex: none;\n}\n\n.dsm-toggle-switch:disabled {\n  cursor: default;\n  opacity: .55;\n}\n\n.dsm-composer-toggle[data-on] .dsm-toggle-switch {\n  border-color: var(--dsw-alias-brand-primary);\n  background: var(--dsw-alias-brand-primary);\n}\n\n.dsm-toggle-knob {\n  position: absolute;\n  top: 2px;\n  left: 2px;\n  width: 12px;\n  height: 12px;\n  border-radius: 50%;\n  background: var(--dsw-alias-bg-layer-1);\n  box-shadow: 0 1px 2px rgba(0, 0, 0, .25);\n  transition: transform .18s ease;\n}\n\n.dsm-composer-toggle[data-on] .dsm-toggle-knob {\n  transform: translateX(12px);\n}\n\n.dsm-toggle-label {\n  display: inline-flex;\n  align-items: center;\n  gap: 2px;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  max-width: 180px;\n  white-space: nowrap;\n}\n\n/* \u300C\u51B7\u5496\u5561\u300D\u53E3\u4EE4\uFF1A\u70B9\u51FB\u590D\u5236\u3002\u56FE\u6807\u63D0\u793A\u53EF\u70B9\uFF0C\u590D\u5236\u6210\u529F\u77ED\u6682\u53D8\u8272\u3002 */\n.dsm-phrase-copy {\n  display: inline-flex;\n  align-items: center;\n  gap: 3px;\n  padding: 0 2px;\n  border: 0;\n  border-radius: 4px;\n  background: transparent;\n  color: inherit;\n  font: inherit;\n  cursor: pointer;\n  transition: color .15s ease;\n}\n\n.dsm-phrase-copy:hover {\n  color: var(--dsw-alias-label-primary);\n}\n\n.dsm-phrase-copy svg {\n  opacity: .6;\n}\n\n.dsm-phrase-copy:hover svg {\n  opacity: 1;\n}\n\n.dsm-phrase-copy[data-copied] {\n  color: var(--dsw-alias-brand-primary);\n}\n\n.dsm-phrase-copy[data-copied] svg {\n  opacity: 1;\n}\n\n.dsm-copy-toast {\n  position: fixed;\n  top: 18px;\n  left: 50%;\n  transform: translateX(-50%);\n  z-index: 2147483647;\n  padding: 10px 18px;\n  border-radius: 10px;\n  background: rgba(20, 20, 20, .92);\n  color: #fff;\n  font-size: 13px;\n  line-height: 1.4;\n  box-shadow: 0 8px 24px rgba(0, 0, 0, .25);\n  pointer-events: none;\n}\n\n.dsm-copy-toast-err {\n  background: rgba(180, 40, 40, .94);\n}\n\n.dsm-toggle-error {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  width: 14px;\n  height: 14px;\n  border-radius: 50%;\n  color: var(--dsw-alias-label-primary-foreground);\n  background: var(--dsw-alias-risk-danger);\n  font-size: 10px;\n  font-weight: 700;\n  flex: none;\n}\n\n.dsm-runtime {\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n}\n\n.dsm-runtime-head {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n}\n\n.dsm-plugin-row {\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n}\n\n/* \u5168\u5C40\u9ED8\u8BA4\u5F00\u5173\uFF1A\u9760\u53F3\u4E0E\u72B6\u6001\u6307\u793A\u5206\u5F00\uFF0C\u989C\u8272\u4ECD\u8D70\u8BED\u4E49\u4EE4\u724C\u3002 */\n.dsm-default-toggle {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  margin-left: auto;\n  color: var(--dsw-alias-label-secondary);\n  cursor: pointer;\n  font-size: 12px;\n  user-select: none;\n}\n\n.dsm-default-toggle input {\n  width: 14px;\n  height: 14px;\n  accent-color: var(--dsw-alias-label-primary);\n  cursor: pointer;\n}\n\n.dsm-default-toggle:hover {\n  color: var(--dsw-alias-label-primary);\n}\n\n/* \u603B\u5F00\u5173\u4E0E\u9010\u6A21\u578B\u8BBE\u7F6E\u7684\u5173\u7CFB\u8BF4\u660E\uFF0C\u7D27\u8DDF\u5728\u72B6\u6001\u884C\u4E0B\u65B9\u3002 */\n.dsm-hub-hint {\n  margin: 0 0 12px;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 12px;\n  line-height: 1.6;\n}\n\n.dsm-mode-row {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 8px;\n}\n\n.dsm-mode-chip {\n  padding: 5px 10px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 999px;\n  background: var(--dsw-alias-bg-layer-2);\n  color: var(--dsw-alias-label-secondary);\n  font: inherit;\n  font-size: 12px;\n  cursor: pointer;\n}\n\n.dsm-mode-chip:hover {\n  color: var(--dsw-alias-label-primary);\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n/* \u6697\u8272\u4E0B brand-primary \u4F1A\u7FFB\u6210\u6D45\u586B\u5145\uFF0C\u5FC5\u987B\u7528 on-fill \u5B57\u8272\uFF0C\n   \u4E0D\u80FD\u7528 label-on-accent/#fff\uFF08\u53D8\u91CF\u4E0D\u5B58\u5728\uFF0C\u767D\u5E95\u767D\u5B57\uFF09\u3002 */\n.dsm-mode-chip[data-on] {\n  border-color: var(--dsw-alias-button-primary-fill);\n  background: var(--dsw-alias-button-primary-fill);\n  color: var(--dsw-alias-label-primary-foreground);\n  font-weight: 600;\n}\n\n.dsm-mode-chip[data-on]:hover {\n  background: var(--dsw-alias-button-primary-hover);\n  border-color: var(--dsw-alias-button-primary-hover);\n  color: var(--dsw-alias-label-primary-foreground);\n}\n\n.dsm-mode-hint {\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 12px;\n  line-height: 1.5;\n  min-width: 0;\n  flex: 1 1 220px;\n}\n\n.dsm-pentagi-controls {\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n}\n\n.dsm-pentagi-controls .dsm-default-toggle {\n  margin-left: 0;\n}\n\n.dsm-pentagi-port {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 12px;\n}\n\n.dsm-pentagi-port input,\n.dsm-pentagi-port select {\n  width: auto;\n  min-width: 88px;\n  max-width: 240px;\n  padding: 6px 8px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 8px;\n  background: var(--dsw-alias-bg-layer-2);\n  color: var(--dsw-alias-label-primary);\n  font: inherit;\n}\n";

// desktop-plugins/dsh-manager/src/client.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var TERMINAL_LABELS = {
  signal: (signal) => `\u4FE1\u53F7 ${signal}`,
  exitCode: (exitCode) => `\u9000\u51FA ${exitCode}`,
  running: "\u8FD0\u884C\u4E2D",
  failed: "\u5931\u8D25",
  done: "\u5B8C\u6210",
  copy: "\u590D\u5236",
  copied: "\u5DF2\u590D\u5236",
  noOutput: "\u6682\u65E0\u8F93\u51FA",
  collapseAria: "\u6536\u8D77\u65E5\u5FD7",
  collapse: "\u6536\u8D77",
  expandAria: (hidden) => `\u5C55\u5F00\u5176\u4F59 ${hidden} \u884C`,
  expand: (hidden) => `\u5C55\u5F00 ${hidden} \u884C`
};
var inject = ["slots", "locale"];
var NS = "desktop-manager";
var STYLE_MARKER = "data-dsh-desktop-manager-styles";
function installStyles() {
  if (document.querySelector(`[${STYLE_MARKER}]`) !== null) return;
  const tag = document.createElement("style");
  tag.setAttribute(STYLE_MARKER, "");
  tag.textContent = client_default;
  document.head.append(tag);
}
function writeClipboard(text) {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
var name = "dsh-desktop-manager";
function matchProfileId(modelName) {
  const name2 = String(modelName ?? "").toLowerCase();
  const rules = {
    grok: ["grok", "xai"],
    claude: ["claude", "anthropic", "sonnet", "opus", "haiku"],
    glm: ["glm", "chatglm", "zhipu"],
    codex: ["gpt", "codex", "o1", "o3", "openai"],
    deepseek: ["deepseek"]
  };
  for (const [id, patterns] of Object.entries(rules)) {
    if (patterns.some((pattern) => name2.includes(pattern))) return id;
  }
  return "deepseek";
}
function sessionIdOf(zone) {
  if (typeof zone === "string") return zone;
  if (!zone || typeof zone !== "object") return "";
  const record = zone;
  return record.session?.sessionId || record.sessionId || "";
}
function selectionLabel(current, groups) {
  const model = String(current?.model ?? "").trim();
  const provider = String(current?.provider ?? "").trim();
  if (groups) {
    const group = groups.find((item) => item.id === provider);
    const named = group?.models?.find((item) => item.id === model)?.name;
    if (named) return `${named} ${model} ${provider} ${group?.name ?? ""}`;
  }
  return `${model} ${provider}`;
}
var EMPTY_DIRECTORY_SNAPSHOT = {
  current: null,
  groups: [],
  status: "idle"
};
var noopSubscribe = () => () => {
};
var emptyDirectorySnapshot = () => EMPTY_DIRECTORY_SNAPSHOT;
var PROFILE_LABELS = {
  codex: "GPT-5.6/Codex",
  claude: "Claude",
  grok: "Grok 4.6",
  glm: "GLM 5.3",
  deepseek: "DeepSeek"
};
var PROFILE_MATCH_HINTS = {
  codex: "2.1.0 \u5E2D\u4F4D \xB7 \u6307\u4EE4\u5C42\u4E0E\u5DE5\u4F5C\u6D41\u7F16\u6392 \xB7 \u5339\u914D GPT\u3001Codex\u3001o1\u3001o3",
  claude: "2.1.0 \u5E2D\u4F4D \xB7 \u957F\u4F1A\u8BDD\u4E0E\u89C4\u5219\u7EC4\u7EC7 \xB7 \u5339\u914D Claude",
  grok: "2.1.0 \u5E2D\u4F4D \xB7 \u5B9E\u65F6\u4FE1\u606F\u6D41\u4E0E\u6A21\u677F \xB7 \u5339\u914D Grok",
  glm: "2.1.0 \u5E2D\u4F4D \xB7 \u7834\u7532\u8D8A\u72F1\u4E0E\u8D8A\u754C\u91CD\u5199 \xB7 \u5339\u914D GLM\u3001ChatGLM\u3001\u667A\u8C31",
  deepseek: "2.1.0 \u5E2D\u4F4D \xB7 \u6DF1\u5EA6\u63A8\u7406\u4E0E\u4F1A\u8BDD\u5BFC\u51FA \xB7 \u5339\u914D DeepSeek"
};
var PROFILE_WAKE = {
  codex: "[[ENI:PROFILE=MAX]]",
  claude: "[[CB:MAX]]",
  grok: "[[ENI:PROFILE=MAX]]",
  glm: "BREAK//OPEN",
  deepseek: "BREAK//OPEN"
};
var REVERIFY_WAKE = "[[RV:VERIFY]]";
var PENTAGI_WAKE = "[[PG:OPEN]]";
function wakePhraseFor(profileId, mode) {
  if (mode === "reverify") return REVERIFY_WAKE;
  if (mode === "pentagi") return PENTAGI_WAKE;
  return PROFILE_WAKE[profileId] ?? PROFILE_WAKE.deepseek;
}
function modeLabel(mode) {
  return mode === "reverify" ? "Reverify" : mode === "pentagi" ? "PentAGI" : "\u51B7\u5496\u5561";
}
function ColdBrewToggle({ sessionId, session, useSession, directory, loadDirectory, input, inputActions }) {
  const [enabled, setEnabled] = (0, import_react.useState)(null);
  const [mode, setMode] = (0, import_react.useState)("pentagi");
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [error, setError] = (0, import_react.useState)(null);
  const [copied, setCopied] = (0, import_react.useState)(false);
  const [notice, setNotice] = (0, import_react.useState)(null);
  const copiedTimer = (0, import_react.useRef)(null);
  const sessionSnap = typeof useSession === "function" ? useSession() : session;
  const newSession = sessionSnap == null || sessionSnap.blank !== false;
  const snapshot = (0, import_react.useSyncExternalStore)(
    directory?.subscribe ?? noopSubscribe,
    directory?.getSnapshot ?? emptyDirectorySnapshot
  );
  (0, import_react.useEffect)(() => {
    loadDirectory?.();
    const timer = setInterval(() => loadDirectory?.(), snapshot?.current?.model ? 4e3 : 400);
    return () => clearInterval(timer);
  }, [loadDirectory, sessionId, snapshot?.current?.model]);
  const current = snapshot?.current ?? null;
  const model = selectionLabel(current, snapshot?.groups);
  const profileId = matchProfileId(model);
  const profileLabel = current?.model || current?.provider ? PROFILE_LABELS[profileId] ?? profileId : "";
  const wakePhrase = wakePhraseFor(profileId, mode);
  (0, import_react.useEffect)(() => {
    let alive = true;
    const pull = () => {
      const params = new URLSearchParams();
      if (current?.model) params.set("model", current.model);
      if (current?.provider) params.set("provider", current.provider);
      if (newSession) params.set("blank", "1");
      const query = params.toString() ? `?${params}` : "";
      fetch(`/api/coldbrew/session/${encodeURIComponent(sessionId)}${query}`).then((res) => res.json()).then((data) => {
        if (!alive) return;
        setEnabled(data.enabled === true);
        if (data.mode === "reverify" || data.mode === "pentagi" || data.mode === "coldbrew") setMode(data.mode);
      }).catch(() => {
      });
    };
    pull();
    if (!newSession) return () => {
      alive = false;
    };
    const timer = setInterval(pull, 1500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [sessionId, current?.model, current?.provider, newSession]);
  const toggle = async (next) => {
    if (!newSession || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/coldbrew/session/${encodeURIComponent(sessionId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next, model, mode })
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setEnabled(data.enabled === true);
      if (data.mode === "reverify" || data.mode === "pentagi" || data.mode === "coldbrew") setMode(data.mode);
    } catch (reason) {
      setError(reason?.message ?? String(reason));
    } finally {
      setBusy(false);
    }
  };
  const on = enabled === true;
  const flashNotice = (text, ok) => {
    setNotice({ text, ok });
    if (copiedTimer.current !== null) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => {
      setNotice(null);
      setCopied(false);
    }, 1800);
  };
  const fillComposer = (0, import_react.useCallback)(() => {
    const current2 = String(input?.draft ?? "");
    if (current2.trim() !== "") return;
    try {
      inputActions?.setDraft(wakePhrase);
    } catch {
    }
  }, [input, inputActions, wakePhrase]);
  const copyPhrase = (0, import_react.useCallback)(async () => {
    if (on) {
      setCopied(true);
      setError(null);
      flashNotice(`${profileLabel} \xB7 ${modeLabel(mode)} \u5DF2\u5F00\uFF0C\u76F4\u63A5\u53D1\u4EFB\u52A1`, true);
      return;
    }
    const okCopy = () => {
      setCopied(true);
      setError(null);
      fillComposer();
      flashNotice(`\u5DF2\u586B\u5165 ${profileLabel} \u53EF\u9009\u53E3\u4EE4\u300C${wakePhrase}\u300D`, true);
    };
    try {
      await navigator.clipboard.writeText(wakePhrase);
      okCopy();
      return;
    } catch {
    }
    if (writeClipboard(wakePhrase)) {
      okCopy();
      return;
    }
    fillComposer();
    setError("\u590D\u5236\u5931\u8D25");
    flashNotice("\u590D\u5236\u5931\u8D25\uFF0C\u5DF2\u586B\u5165\u8F93\u5165\u6846", false);
  }, [fillComposer, wakePhrase, profileLabel, on, mode]);
  (0, import_react.useEffect)(() => () => {
    if (copiedTimer.current !== null) clearTimeout(copiedTimer.current);
  }, []);
  (0, import_react.useEffect)(() => {
    if (notice === null) return;
    const el = document.createElement("div");
    el.className = notice.ok ? "dsm-copy-toast" : "dsm-copy-toast dsm-copy-toast-err";
    el.textContent = notice.text;
    document.body.appendChild(el);
    return () => {
      el.remove();
    };
  }, [notice]);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-composer-toggle", "data-on": on || void 0, "data-new": newSession || void 0, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "button",
      {
        type: "button",
        className: "dsm-toggle-switch",
        role: "switch",
        "aria-checked": on,
        "aria-label": mode === "reverify" ? "Reverify \u5B57\u8282\u88C1\u5224" : mode === "pentagi" ? "PentAGI \u6E17\u900F\u7F16\u6392" : "\u51B7\u5496\u5561\u7834\u7532",
        disabled: !newSession || busy,
        title: newSession ? on ? `\u5173\u95ED${modeLabel(mode)}` : `\u5F00\u542F${modeLabel(mode)}` : "\u4EC5\u65B0\u4F1A\u8BDD\u53EF\u8C03\u6574",
        onClick: () => void toggle(!on),
        children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsm-toggle-knob" })
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dsm-toggle-label", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
        "button",
        {
          type: "button",
          className: "dsm-phrase-copy",
          title: on ? `${profileLabel} \xB7 ${modeLabel(mode)} \u5DF2\u5F00\uFF0C\u76F4\u63A5\u53D1\u4EFB\u52A1` : `\u5F00\u5173\u5173\u95ED\u65F6\u53EF\u9009\u53E3\u4EE4\u300C${wakePhrase}\u300D`,
          "aria-label": on ? `${profileLabel} \xB7 ${modeLabel(mode)} \u5DF2\u5F00` : `\u590D\u5236 ${profileLabel} \u53EF\u9009\u53E3\u4EE4 ${wakePhrase}`,
          "data-copied": copied || void 0,
          onClick: () => void copyPhrase(),
          children: [
            modeLabel(mode),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconCopyOutline16, { size: 12 })
          ]
        }
      ),
      on && profileLabel ? ` \xB7 ${profileLabel}` : ""
    ] }),
    error !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsm-toggle-error", title: error, children: "!" })
  ] });
}
function engineIsNative(slot) {
  const engine = slot?.engine;
  return Boolean(engine && engine !== "pure-python" && engine !== "none");
}
function describeReverify(status) {
  const coreOk = status?.present === true || status?.ok === true;
  const fidelityOk = status?.engines?.full_fidelity === true;
  const angrOk = engineIsNative(status?.engines?.semantic);
  const pythonError = status?.python?.error;
  const pythonVersion = status?.python?.version;
  if (status === null) {
    return {
      tone: "warning",
      headline: "\u6B63\u5728\u63A2\u6D4B\u672C\u673A\u73AF\u5883\u2026",
      detail: "\u5148\u786E\u8BA4 Python \u548C\u5F15\u64CE\u88C5\u5230\u54EA\u4E00\u5C42\uFF0C\u518D\u51B3\u5B9A\u8981\u4E0D\u8981\u52A8\u624B\u3002",
      rows: [
        { name: "\u6838\u5FC3", ok: false, note: "\u63A2\u6D4B\u4E2D" },
        { name: "\u9AD8\u7CBE\u5EA6\u5F15\u64CE", ok: false, note: "\u63A2\u6D4B\u4E2D" },
        { name: "\u8C03\u7528\u56FE\u5F15\u64CE", ok: false, note: "\u63A2\u6D4B\u4E2D" }
      ],
      needPython: false,
      needFidelity: false,
      needAngr: false
    };
  }
  if (pythonError) {
    return {
      tone: "error",
      headline: "\u8FD8\u4E0D\u80FD\u7528",
      detail: `\u672C\u673A\u627E\u4E0D\u5230 Python 3.8+\u3002\u88C5\u597D\u540E\u518D\u70B9\u91CD\u65B0\u63A2\u6D4B\u3002${pythonError}`,
      rows: [
        { name: "\u6838\u5FC3", ok: Boolean(status.present), note: status.present ? "\u5DF2\u968F\u5E94\u7528\u6253\u5305\uFF0C\u7B49 Python" : "\u5E94\u7528\u5305\u91CC\u7F3A\u6587\u4EF6" },
        { name: "\u9AD8\u7CBE\u5EA6\u5F15\u64CE", ok: false, note: "\u9700\u8981\u5148\u6709 Python" },
        { name: "\u8C03\u7528\u56FE\u5F15\u64CE", ok: false, note: "\u9700\u8981\u5148\u6709 Python" }
      ],
      needPython: true,
      needFidelity: false,
      needAngr: false
    };
  }
  if (status.engines?.error && !fidelityOk) {
    return {
      tone: "warning",
      headline: "\u63A2\u6D4B\u5F02\u5E38",
      detail: status.engines.error,
      rows: [
        { name: "\u6838\u5FC3", ok: coreOk, note: coreOk ? "\u5DF2\u968F\u5E94\u7528\u6253\u5305" : "\u5E94\u7528\u5305\u91CC\u7F3A\u6587\u4EF6" },
        { name: "\u9AD8\u7CBE\u5EA6\u5F15\u64CE", ok: false, note: "\u63A2\u6D4B\u5931\u8D25\uFF0C\u53EF\u518D\u88C5\u4E00\u6B21" },
        { name: "\u8C03\u7528\u56FE\u5F15\u64CE", ok: angrOk, note: angrOk ? "\u51FD\u6570\u8FB9\u754C\u548C\u8C03\u7528\u56FE" : "\u53EF\u9009\uFF0C\u672A\u63A2\u6D4B\u5230" }
      ],
      needPython: false,
      needFidelity: true,
      needAngr: !angrOk
    };
  }
  const pythonBit = pythonVersion ? `Python ${pythonVersion}` : "\u7CFB\u7EDF Python";
  if (fidelityOk && angrOk) {
    return {
      tone: "done",
      headline: `\u5DF2\u5168\u90E8\u5C31\u7EEA \xB7 ${pythonBit}`,
      detail: "\u62C6\u6837\u672C\u3001\u53CD\u6C47\u7F16\u3001\u6A21\u62DF\u3001\u8C03\u7528\u56FE\u90FD\u53EF\u4EE5\u76F4\u63A5\u7528\uFF0C\u4E0D\u7528\u518D\u88C5\u3002",
      rows: [
        { name: "\u6838\u5FC3", ok: true, note: "\u5DF2\u968F\u5E94\u7528\u6253\u5305" },
        { name: "\u9AD8\u7CBE\u5EA6\u5F15\u64CE", ok: true, note: "\u53CD\u6C47\u7F16 / \u6A21\u62DF / PE\xB7ELF\xB7Mach-O" },
        { name: "\u8C03\u7528\u56FE\u5F15\u64CE", ok: true, note: "\u51FD\u6570\u8FB9\u754C\u548C\u8C03\u7528\u56FE" }
      ],
      needPython: false,
      needFidelity: false,
      needAngr: false
    };
  }
  if (fidelityOk) {
    return {
      tone: "done",
      headline: `\u5DF2\u5C31\u7EEA \xB7 ${pythonBit}`,
      detail: "\u65E5\u5E38\u62C6\u6837\u672C\u5DF2\u7ECF\u591F\u7528\u3002\u8C03\u7528\u56FE\u5F15\u64CE\u662F\u53EF\u9009\u9879\uFF1A\u4E0D\u88C5\u4E5F\u80FD\u62C6\uFF0C\u53EA\u662F\u51FD\u6570\u8FB9\u754C\u4F1A\u964D\u7EA7\u3002",
      rows: [
        { name: "\u6838\u5FC3", ok: true, note: "\u5DF2\u968F\u5E94\u7528\u6253\u5305" },
        { name: "\u9AD8\u7CBE\u5EA6\u5F15\u64CE", ok: true, note: "\u53CD\u6C47\u7F16 / \u6A21\u62DF / PE\xB7ELF\xB7Mach-O" },
        { name: "\u8C03\u7528\u56FE\u5F15\u64CE", ok: false, note: "\u672A\u88C5 \xB7 \u53EF\u9009\uFF0C\u9700\u8981\u51FD\u6570\u8FB9\u754C\u65F6\u518D\u52A0" }
      ],
      needPython: false,
      needFidelity: false,
      needAngr: true
    };
  }
  return {
    tone: "warning",
    headline: `\u80FD\u7528\uFF0C\u7CBE\u5EA6\u504F\u4F4E \xB7 ${pythonBit}`,
    detail: "\u6838\u5FC3\u5DF2\u7ECF\u80FD\u8DD1\u3002\u9AD8\u7CBE\u5EA6\u5F15\u64CE\u8FD8\u6CA1\u88C5\uFF0C\u53CD\u6C47\u7F16\u548C\u6A21\u62DF\u4F1A\u6162\u3001\u4E5F\u66F4\u5BB9\u6613\u770B\u8D70\u773C\u3002",
    rows: [
      { name: "\u6838\u5FC3", ok: coreOk, note: coreOk ? "\u5DF2\u968F\u5E94\u7528\u6253\u5305" : "\u5E94\u7528\u5305\u91CC\u7F3A\u6587\u4EF6" },
      { name: "\u9AD8\u7CBE\u5EA6\u5F15\u64CE", ok: false, note: "\u672A\u88C5 capstone / unicorn / lief / z3" },
      { name: "\u8C03\u7528\u56FE\u5F15\u64CE", ok: angrOk, note: angrOk ? "\u51FD\u6570\u8FB9\u754C\u548C\u8C03\u7528\u56FE" : "\u672A\u88C5 \xB7 \u53EF\u9009" }
    ],
    needPython: false,
    needFidelity: true,
    needAngr: !angrOk
  };
}
function ReverifyCard(props) {
  const view = describeReverify(props.status);
  const showActions = view.needPython || view.needFidelity || view.needAngr;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", { className: "dsm-card dsm-card-stack", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-card-main", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dsm-card-title", children: [
        "Reverify \u5B57\u8282\u88C1\u5224",
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsm-card-id", children: "0.9.0" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dsm-state", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.StateDot, { state: view.tone, size: 8 }),
        view.headline
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsm-card-sub", children: view.detail })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { className: "dsm-cap-list", children: view.rows.map((row) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { className: "dsm-cap", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.StateDot, { state: row.ok ? "done" : "warning", size: 8 }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-cap-body", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsm-cap-name", children: row.name }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsm-cap-note", children: row.note })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsm-cap-mark", "data-on": row.ok || void 0, children: row.ok ? "\u5DF2\u88C5" : "\u672A\u88C5" })
    ] }, row.name)) }),
    showActions && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-actions", children: [
      view.needPython && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { onClick: props.onProbe, disabled: props.busy, variant: "primary", size: "sm", children: "\u91CD\u65B0\u63A2\u6D4B" }),
      view.needFidelity && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        import_dsh_client_ui_primitives.Button,
        {
          onClick: () => props.onInstall("full"),
          disabled: props.busy,
          variant: "primary",
          size: "sm",
          children: props.installingExtra === "full" ? "\u6B63\u5728\u5B89\u88C5\u9AD8\u7CBE\u5EA6\u5F15\u64CE\u2026" : "\u5B89\u88C5\u9AD8\u7CBE\u5EA6\u5F15\u64CE"
        }
      ),
      view.needAngr && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        import_dsh_client_ui_primitives.Button,
        {
          onClick: () => props.onInstall("angr"),
          disabled: props.busy,
          variant: "outline",
          size: "sm",
          children: props.installingExtra === "angr" ? "\u6B63\u5728\u5B89\u88C5\u8C03\u7528\u56FE\u5F15\u64CE\u2026" : "\u52A0\u88C5\u8C03\u7528\u56FE\u5F15\u64CE"
        }
      )
    ] })
  ] });
}
function describePentagi(status) {
  const dockerOk = status?.docker?.ok === true;
  const daemonOk = status?.docker?.daemon === true;
  const apiOk = status?.api?.ok === true;
  const tokenOk = status?.tokenPresent === true;
  const source = status?.embedding?.source === "local" || status?.embedding?.source === "api" ? status.embedding.source : "none";
  const localOk = status?.embedding?.local?.ok === true;
  const composeOk = status?.compose?.running === true;
  const sandboxOn = status?.sandbox?.enabled !== false;
  const sandboxReady = status?.sandbox?.ok === true;
  const dindOn = status?.sandbox?.dind?.enabled === true;
  if (status === null) {
    return {
      tone: "warning",
      headline: "\u6B63\u5728\u63A2\u6D4B\u540E\u7AEF\u2026",
      detail: "\u5148\u786E\u8BA4 Docker / compose / :8443 / Token / Kali \u6C99\u7BB1\u3002",
      rows: [
        { name: "Docker", ok: false, note: "\u63A2\u6D4B\u4E2D" },
        { name: "Compose", ok: false, note: "\u63A2\u6D4B\u4E2D" },
        { name: "API :8443", ok: false, note: "\u63A2\u6D4B\u4E2D" },
        { name: "API Token", ok: false, note: "\u63A2\u6D4B\u4E2D" },
        { name: "Kali \u6C99\u7BB1", ok: false, note: "\u63A2\u6D4B\u4E2D" },
        { name: "DinD", ok: false, note: "\u63A2\u6D4B\u4E2D" },
        { name: "\u7F16\u6392\u5185\u6838", ok: true, note: "\u968F\u6A21\u5F0F\u6CE8\u5165\uFF0C\u65E0\u9700\u5B89\u88C5" }
      ]
    };
  }
  const rows = [
    {
      name: "Docker",
      ok: dockerOk && daemonOk,
      note: !dockerOk ? `\u672A\u5B89\u88C5 CLI \xB7 ${status.dockerStack?.os || ""}/${status.dockerStack?.arch || ""} \xB7 \u70B9\u300C\u5B89\u88C5 Docker \u4F9D\u8D56\u300D` : daemonOk ? status.docker?.version ?? "\u5DF2\u5C31\u7EEA" : status.dockerStack?.os === "win32" ? "CLI \u5728\uFF0C\u5F15\u64CE\u672A\u5F00\uFF08\u4F1A\u542F\u52A8 Docker Desktop\uFF09" : "CLI \u5728\uFF0Cdaemon \u672A\u5F00\uFF08\u4F1A\u5C1D\u8BD5 Colima / Docker Desktop\uFF09"
    },
    { name: "Compose", ok: composeOk, note: composeOk ? "pentagi \u5BB9\u5668\u5728\u8DD1" : "\u672A\u542F\u52A8" },
    { name: `API :${status.port ?? 8443}`, ok: apiOk, note: apiOk ? `\u53EF\u5230\u8FBE \xB7 ${status.api?.url ?? ""}` : status.api?.error ?? "\u672A\u5230\u8FBE" },
    { name: "API Token", ok: tokenOk, note: tokenOk ? "\u5DF2\u5199\u5165\u684C\u9762\u8BBE\u7F6E" : "\u672A\u7B7E\u53D1" },
    {
      name: "Kali \u6C99\u7BB1",
      ok: sandboxOn && sandboxReady,
      note: !sandboxOn ? "\u5DF2\u5173\u95ED \xB7 pg_terminal \u8D70\u672C\u673A shell" : sandboxReady ? `${status.sandbox?.image ?? "vxcontrol/kali-linux"} \xB7 ${status.sandbox?.inspect ?? "\u5DF2 pull"}` : `\u672A pull \xB7 docker pull ${status.sandbox?.image ?? "vxcontrol/kali-linux"}`
    },
    {
      name: "DinD",
      ok: dindOn && sandboxReady,
      note: dindOn ? status.sandbox?.dind?.note ?? "Kali \u5185 docker CLI \u6302 VM sock" : "\u5173\u95ED \xB7 Kali \u91CC\u6CA1\u6709 docker daemon"
    },
    { name: "\u7F16\u6392\u5185\u6838", ok: true, note: "\u968F\u6A21\u5F0F\u6CE8\u5165\uFF0C\u65E0\u9700\u5B89\u88C5" },
    {
      name: "\u5411\u91CF\u68C0\u7D22",
      ok: source === "local" ? localOk : source === "api" ? Boolean(status.embedding?.hasKey && status.embedding?.apiUrl) : false,
      note: source === "local" ? localOk ? `\u672C\u673A sidecar :${status.embedding?.port ?? 63229} \xB7 ${status.embedding?.model ?? "bge-small"}` : "\u672C\u673A\u672A\u542F\u52A8\uFF08\u7EA6 0.5GB\uFF0C\u70B9\u4E0B\u9762\u542F\u52A8\uFF09" : source === "api" ? status.embedding?.apiUrl ? `\u72EC\u7ACB API \xB7 ${status.embedding.apiModel || "text-embedding-3-small"}` : "\u5DF2\u9009\u72EC\u7ACB API\uFF0C\u4F46\u8FD8\u6CA1\u586B\u5730\u5740" : "\u5173\u95ED \xB7 \u4E0E\u8C03\u5EA6\u6A21\u578B\u5206\u5F00\uFF0C\u4E0D\u5360\u5185\u5B58"
    }
  ];
  if (status.backendReady) {
    return { tone: "done", headline: "\u5B98\u65B9\u540E\u7AEF\u5DF2\u878D\u5408", detail: "compose + :8443 + token \u90FD\u5728\uFF0C\u6A21\u578B\u53EF\u6253 GraphQL/\u6C99\u7BB1\u3002", rows };
  }
  return {
    tone: "warning",
    headline: "\u9884\u7F6E\u5185\u6838\u5C31\u7EEA\uFF0C\u5B98\u65B9\u6808\u672A\u8D77",
    detail: "Harness \u542F\u52A8\u540E\u4F1A\u81EA\u52A8\u62C9 compose \u5B88\u62A4\u8FDB\u7A0B\uFF08\u5173\u6389\u672C\u754C\u9762\u4E5F\u4E0D\u4F1A\u505C\uFF09\u3002\u4E00\u822C\u4E0D\u7528 Web UI\uFF0C\u6A21\u578B\u8D70 :8443 API\u3002\u4E5F\u53EF\u624B\u52A8\u70B9\u542F\u52A8\u3002",
    rows
  };
}
function PentagiCard(props) {
  const view = describePentagi(props.status);
  const running = props.status?.compose?.running === true || props.status?.api?.ok === true;
  const port = props.status?.port ?? 8443;
  const stopOnExit = props.status?.stopOnExit !== false;
  const autostart = props.status?.autostart !== false;
  const sandboxOn = props.status?.sandbox?.enabled !== false;
  const dindOn = props.status?.sandbox?.dind?.enabled === true;
  const embeddingSource = props.status?.embedding?.source === "local" || props.status?.embedding?.source === "api" ? props.status.embedding.source : "none";
  const localEmbedOn = props.status?.embedding?.local?.ok === true;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", { className: "dsm-card dsm-card-stack", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-card-main", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dsm-card-title", children: [
        "PentAGI \u5B98\u65B9\u540E\u7AEF",
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsm-card-id", children: "\u5B88\u62A4\u8FDB\u7A0B \xB7 API" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dsm-state", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.StateDot, { state: view.tone, size: 8 }),
        view.headline
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsm-card-sub", children: view.detail }),
      props.status?.root ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsm-card-link", children: props.status.root }) : null
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { className: "dsm-cap-list", children: view.rows.map((row) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { className: "dsm-cap", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.StateDot, { state: row.ok ? "done" : "warning", size: 8 }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-cap-body", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsm-cap-name", children: row.name }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsm-cap-note", children: row.note })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsm-cap-mark", "data-on": row.ok || void 0, children: row.ok ? "\u5DF2\u5C31\u7EEA" : "\u672A\u5C31\u7EEA" })
    ] }, row.name)) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-pentagi-controls", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "dsm-pentagi-port", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u540E\u7AEF\u7AEF\u53E3" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            type: "number",
            min: 1,
            max: 65535,
            defaultValue: port,
            disabled: props.busy,
            onBlur: (event) => {
              const next = Number(event.target.value);
              if (Number.isInteger(next) && next >= 1 && next <= 65535 && next !== port) {
                props.onConfig({ port: next });
              }
            }
          },
          port
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "dsm-default-toggle", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            type: "checkbox",
            checked: autostart,
            disabled: props.busy,
            onChange: (event) => props.onConfig({ autostart: event.target.checked })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u542F\u52A8 Harness \u65F6\u81EA\u52A8\u62C9\u8D77\u540E\u7AEF" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "dsm-default-toggle", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            type: "checkbox",
            checked: stopOnExit,
            disabled: props.busy,
            onChange: (event) => props.onConfig({ stopOnExit: event.target.checked })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u5173\u95ED Harness \u65F6\u4E00\u5E76\u505C\u6B62\u540E\u7AEF" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "dsm-default-toggle", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            type: "checkbox",
            checked: sandboxOn,
            disabled: props.busy,
            onChange: (event) => props.onConfig({ sandbox: event.target.checked, ...event.target.checked ? {} : { dind: false } })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u542F\u7528 Kali \u6C99\u7BB1\uFF08pg_terminal \u8FDB vxcontrol/kali-linux\uFF09" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "dsm-default-toggle", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            type: "checkbox",
            checked: dindOn,
            disabled: props.busy || !sandboxOn,
            onChange: (event) => props.onConfig({ dind: event.target.checked, ...event.target.checked ? { sandbox: true } : {} })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u542F\u7528 DinD\uFF08Kali \u5185 docker \u8D70 Colima VM sock\uFF09" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "dsm-pentagi-port", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u8C03\u5EA6\u6A21\u578B" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "select",
          {
            value: props.status?.harnessProvider || props.status?.harness?.preferred || "auto",
            disabled: props.busy,
            onChange: (event) => props.onConfig({ harnessProvider: event.target.value }),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "auto", children: "\u81EA\u52A8\u6311\u4E00\u4E2A\u80FD\u7528\u7684" }),
              (props.status?.harness?.providers ?? []).map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", { value: p.id, children: [
                p.displayName || p.id,
                " \xB7 ",
                p.model,
                p.healthy ? "" : "\uFF08\u63A2\u6D4B\u5931\u8D25\uFF09"
              ] }, p.id))
            ]
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsm-card-sub", children: props.status?.harness?.pick ? `\u5F53\u524D\u540C\u6B65\uFF1A${props.status.harness.pick.displayName}/${props.status.harness.pick.model}\uFF08${props.status.harness.pick.healthy ? "\u80FD\u6253\u901A" : "\u672A\u6253\u901A"}\uFF09` : "\u8FD8\u6CA1\u540C\u6B65\uFF1A\u70B9\u4E0B\u9762\u300C\u540C\u6B65 Harness \u6A21\u578B\u300D\uFF0C\u6216\u542F\u52A8\u540E\u7AEF\u65F6\u81EA\u52A8\u62C9\u3002Harness \u91CC\u5220\u6389\u7684\u4E5F\u4F1A\u4ECE\u5B98\u65B9\u6808\u62FF\u6389\u3002" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "dsm-pentagi-port", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u5411\u91CF\u68C0\u7D22\uFF08\u4E0E\u8C03\u5EA6\u5206\u5F00\uFF09" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "select",
          {
            value: embeddingSource,
            disabled: props.busy,
            onChange: (event) => props.onConfig({ embeddingSource: event.target.value }),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "none", children: "\u5173\u95ED\uFF08\u4E0D\u5360\u5185\u5B58\uFF09" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "local", children: "\u672C\u673A sidecar\uFF08fastembed / \u7EA6 0.5GB\uFF09" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "api", children: "\u72EC\u7ACB Embedding API\uFF08\u7845\u57FA/\u667A\u8C31/OpenAI\u2026\uFF09" })
            ]
          }
        )
      ] }),
      embeddingSource === "api" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "dsm-pentagi-port", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Embedding \u5730\u5740" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              type: "url",
              placeholder: "https://api.siliconflow.cn/v1",
              defaultValue: props.status?.embedding?.apiUrl || "",
              disabled: props.busy,
              onBlur: (event) => {
                const next = event.target.value.trim();
                if (next !== (props.status?.embedding?.apiUrl || "")) props.onConfig({ embeddingApiUrl: next });
              }
            },
            props.status?.embedding?.apiUrl || "api-url"
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "dsm-pentagi-port", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Embedding \u6A21\u578B" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              type: "text",
              placeholder: "BAAI/bge-m3 \u6216 embedding-3 \u6216 text-embedding-3-small",
              defaultValue: props.status?.embedding?.apiModel || "text-embedding-3-small",
              disabled: props.busy,
              onBlur: (event) => {
                const next = event.target.value.trim();
                if (next) props.onConfig({ embeddingApiModel: next });
              }
            },
            props.status?.embedding?.apiModel || "api-model"
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "dsm-pentagi-port", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Embedding Key" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              type: "password",
              placeholder: props.status?.embedding?.hasKey ? "\u5DF2\u4FDD\u5B58\uFF0C\u7559\u7A7A\u4E0D\u6539" : "sk-\u2026 \u6216\u7845\u57FA/\u667A\u8C31 token",
              disabled: props.busy,
              onBlur: (event) => {
                const next = event.target.value.trim();
                if (next) props.onConfig({ embeddingApiKey: next });
              }
            }
          )
        ] })
      ] }),
      embeddingSource === "local" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsm-card-sub", children: localEmbedOn ? "\u672C\u673A\u5411\u91CF\u670D\u52A1\u5DF2\u5728\u8DD1\u3002\u70B9\u300C\u505C\u6B62\u672C\u673A\u5411\u91CF\u300D\u624D\u91CA\u653E\u5185\u5B58\u3002" : props.status?.embedding?.fastembed?.ok ? "\u4F9D\u8D56\u5DF2\u88C5\u3002\u70B9\u300C\u542F\u52A8\u672C\u673A\u5411\u91CF\u300D\u624D\u4F1A\u5360\u5927\u7EA6\u534A GB\uFF0C\u4E0D\u4F1A\u52A8 Grok\u3002" : "\u7B2C\u4E00\u6B21\u4F1A\u5728 ~/.dsh/pentagi/embedder-venv \u91CC\u88C5 fastembed\uFF08\u4E0D\u78B0 Homebrew Python\uFF09\uFF0C\u518D\u4E0B\u8F7D\u7EA6 270MB \u6A21\u578B\uFF0C\u7136\u540E\u76D1\u542C :63229\u3002\u9700\u8981\u672C\u673A python3\u3002" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-action-group", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { onClick: props.onProbe, disabled: props.busy, variant: "outline", size: "sm", children: "\u91CD\u65B0\u63A2\u6D4B" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { onClick: props.onInstallAll, disabled: props.busy, variant: "primary", size: "sm", children: props.busy ? "\u6B63\u5728\u5B89\u88C5\u5168\u90E8\u2026" : "\u5B89\u88C5\u5168\u90E8\u540E\u7AEF" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { onClick: props.onUninstallAll, disabled: props.busy, variant: "outline", size: "sm", children: props.busy ? "\u6B63\u5728\u5378\u8F7D\u2026" : "\u5378\u8F7D\u5168\u90E8\u540E\u7AEF" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-action-group", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { onClick: props.onInstallDocker, disabled: props.busy, variant: "outline", size: "sm", children: props.busy ? "\u6B63\u5728\u5B89\u88C5 Docker\u2026" : props.status?.docker?.ok && props.status?.docker?.daemon ? "\u91CD\u88C5/\u4FEE\u590D Docker \u4F9D\u8D56" : "\u5B89\u88C5 Docker \u4F9D\u8D56" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { onClick: props.onStart, disabled: props.busy, variant: "primary", size: "sm", children: props.busy ? "\u6B63\u5728\u542F\u52A8\u2026" : running ? "\u91CD\u65B0\u542F\u52A8\u540E\u7AEF" : "\u542F\u52A8\u540E\u7AEF" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { onClick: props.onStop, disabled: props.busy || !running, variant: "outline", size: "sm", children: props.busy ? "\u6B63\u5728\u505C\u6B62\u2026" : "\u505C\u6B62\u540E\u7AEF" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { onClick: props.onSyncModels, disabled: props.busy, variant: "outline", size: "sm", children: props.busy ? "\u6B63\u5728\u540C\u6B65\u2026" : "\u540C\u6B65 Harness \u6A21\u578B" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-action-group", children: [
        embeddingSource === "local" && !localEmbedOn && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { onClick: () => props.onEmbedder("start"), disabled: props.busy, variant: "primary", size: "sm", children: props.busy ? "\u6B63\u5728\u5B89\u88C5/\u542F\u52A8\u2026" : props.status?.embedding?.fastembed?.ok ? "\u542F\u52A8\u672C\u673A\u5411\u91CF" : "\u5B89\u88C5\u5E76\u542F\u52A8\u672C\u673A\u5411\u91CF" }),
        embeddingSource === "local" && localEmbedOn && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { onClick: () => props.onEmbedder("stop"), disabled: props.busy, variant: "outline", size: "sm", children: props.busy ? "\u6B63\u5728\u505C\u6B62\u2026" : "\u505C\u6B62\u672C\u673A\u5411\u91CF" })
      ] })
    ] })
  ] });
}
function useToast() {
  const [toast, setToast] = (0, import_react.useState)(null);
  const toastSeq = (0, import_react.useRef)(0);
  const showToast = (text) => {
    toastSeq.current += 1;
    setToast({ seq: toastSeq.current, text });
  };
  return { toast, setToast, showToast };
}
function PentagiSection() {
  const [pentagi, setPentagi] = (0, import_react.useState)(null);
  const [logs, setLogs] = (0, import_react.useState)([]);
  const [progress, setProgress] = (0, import_react.useState)(null);
  const [loading, setLoading] = (0, import_react.useState)(true);
  const [busy, setBusy] = (0, import_react.useState)(false);
  const { toast, setToast, showToast } = useToast();
  const pollTimer = (0, import_react.useRef)(null);
  const fetchLogs = (0, import_react.useCallback)(async () => {
    try {
      const res = await fetch("/api/coldbrew/pentagi/logs");
      const data = await res.json().catch(() => ({ logs: [] }));
      if (Array.isArray(data.logs) && data.logs.length > 0) setLogs(data.logs);
      if (data.progress) setProgress(data.progress);
      else if (!data.isRunning) setProgress(null);
    } catch (error) {
      console.error("Failed to fetch pentagi logs", error);
    }
  }, []);
  const startPolling = (0, import_react.useCallback)(() => {
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = setInterval(fetchLogs, 500);
  }, [fetchLogs]);
  const refresh = (0, import_react.useCallback)(async () => {
    setLoading(true);
    try {
      const [profilesRes, modelsRes] = await Promise.all([
        fetch("/api/coldbrew/profiles"),
        fetch("/api/coldbrew/pentagi/models")
      ]);
      const profilesData = await profilesRes.json();
      const modelsData = await modelsRes.json().catch(() => ({}));
      setPentagi({
        ...profilesData.pentagi ?? {},
        ...modelsData.harness ? { harness: modelsData.harness, harnessProvider: modelsData.harnessProvider } : {}
      });
    } catch (error) {
      console.error("Failed to fetch pentagi status", error);
    } finally {
      setLoading(false);
    }
  }, []);
  (0, import_react.useEffect)(() => {
    refresh();
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [refresh]);
  const savePentagiConfig = async (patch) => {
    try {
      const res = await fetch("/api/coldbrew/pentagi/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "\u4FDD\u5B58\u5931\u8D25");
      setPentagi(data);
      if (patch.port) showToast(`\u7AEF\u53E3\u5DF2\u6539\u4E3A ${patch.port}\uFF0C\u70B9\u542F\u52A8\u540E\u7AEF\u624D\u4F1A\u5E94\u7528\u5230\u5BB9\u5668`);
      else if (patch.stopOnExit === true) showToast("\u5173\u95ED Harness \u65F6\u4F1A\u505C\u6B62 PentAGI \u540E\u7AEF");
      else if (patch.stopOnExit === false) showToast("\u5173\u95ED Harness \u540E\u540E\u7AEF\u7EE7\u7EED\u8DD1");
      else if (patch.autostart === false) showToast("\u4E0B\u6B21\u6253\u5F00 Harness \u4E0D\u518D\u81EA\u52A8\u62C9\u540E\u7AEF");
      else if (patch.autostart === true) showToast("\u4E0B\u6B21\u6253\u5F00 Harness \u4F1A\u81EA\u52A8\u62C9\u540E\u7AEF");
      else if (patch.sandbox === false) showToast("Kali \u6C99\u7BB1\u5DF2\u5173\uFF0Cpg_terminal \u8D70\u672C\u673A");
      else if (patch.sandbox === true && patch.dind !== true) showToast("Kali \u6C99\u7BB1\u5DF2\u5F00\uFF0Cpg_terminal \u8FDB vxcontrol/kali-linux");
      else if (patch.dind === true) showToast("DinD \u5DF2\u5F00\uFF1AKali \u5185 docker \u8D70 Colima VM sock");
      else if (patch.dind === false) showToast("DinD \u5DF2\u5173\uFF1AKali \u91CC\u6CA1\u6709 docker daemon");
      else if (patch.harnessProvider === "auto") showToast("\u8C03\u5EA6\u4F1A\u81EA\u52A8\u6311\u4E00\u4E2A\u80FD\u7528\u7684 Harness \u6A21\u578B");
      else if (patch.harnessProvider) showToast(`\u5DF2\u9489\u6B7B\u8C03\u5EA6\u6A21\u578B\uFF1A${patch.harnessProvider}\uFF0C\u518D\u70B9\u540C\u6B65\u6216\u91CD\u542F\u540E\u7AEF`);
      else if (patch.embeddingSource === "none") showToast("\u5411\u91CF\u68C0\u7D22\u5DF2\u5173\uFF0C\u4E0D\u5360\u5185\u5B58\uFF1B\u8C03\u5EA6\u6A21\u578B\u4E0D\u53D8");
      else if (patch.embeddingSource === "local") showToast("\u5DF2\u9009\u672C\u673A\u5411\u91CF\u3002\u70B9\u300C\u542F\u52A8\u672C\u673A\u5411\u91CF\u300D\u624D\u4F1A\u5360\u5185\u5B58");
      else if (patch.embeddingSource === "api") showToast("\u5DF2\u9009\u72EC\u7ACB Embedding API\uFF0C\u548C Grok \u8C03\u5EA6\u5206\u5F00");
      else if (patch.embeddingApiUrl || patch.embeddingApiKey || patch.embeddingApiModel) showToast("Embedding API \u5DF2\u4FDD\u5B58\uFF0C\u91CD\u542F PentAGI \u540E\u7AEF\u540E\u751F\u6548");
    } catch (error) {
      showToast(`\u4FDD\u5B58\u5931\u8D25: ${error.message}`);
    }
  };
  const syncPentagiModels = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/coldbrew/pentagi/sync-models", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "\u540C\u6B65\u5931\u8D25");
      setPentagi(data);
      showToast(data.note || "Harness \u6A21\u578B\u5DF2\u540C\u6B65\u5230\u5B98\u65B9\u6808");
    } catch (error) {
      showToast(`\u540C\u6B65\u5931\u8D25: ${error.message}`);
    } finally {
      setBusy(false);
      await refresh();
    }
  };
  const startPentagi = async () => {
    setBusy(true);
    setLogs(["\u542F\u52A8 PentAGI \u5B98\u65B9\u540E\u7AEF\u2026"]);
    startPolling();
    try {
      const res = await fetch("/api/coldbrew/pentagi/start", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (Array.isArray(data.logs) && data.logs.length > 0) setLogs(data.logs);
      if (!res.ok) throw new Error(data.error ?? "\u542F\u52A8\u5931\u8D25");
      setPentagi(data);
      showToast("PentAGI \u5B98\u65B9\u540E\u7AEF\u5DF2\u542F\u52A8");
    } catch (error) {
      showToast(`\u542F\u52A8\u5931\u8D25: ${error.message}`);
    } finally {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
      setBusy(false);
      await refresh();
    }
  };
  const runningLooksLikeDocker = (data) => data.runningTask === "docker-install";
  const installAllPentagi = async () => {
    setBusy(true);
    setLogs(["=== \u4E00\u952E\u5B89\u88C5\u5168\u90E8\u540E\u7AEF\uFF1ADocker/Colima \u2192 \u540E\u7AEF compose \u2192 \u672C\u673A\u5411\u91CF ==="]);
    startPolling();
    try {
      const res = await fetch("/api/coldbrew/pentagi/install-all", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (Array.isArray(data.logs) && data.logs.length > 0) setLogs(data.logs);
      if (data.isRunning) {
        showToast("\u6B63\u5728\u4E00\u952E\u5B89\u88C5\uFF08\u542B Docker \u2192 \u540E\u7AEF \u2192 \u5411\u91CF\uFF09\uFF0C\u770B\u4E0B\u9762\u65E5\u5FD7\uFF0C\u88C5\u5B8C\u81EA\u52A8\u5237\u65B0");
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "\u4E00\u952E\u5B89\u88C5\u5931\u8D25");
      setPentagi(data);
      showToast("\u5168\u90E8\u540E\u7AEF\u5B89\u88C5\u5B8C\u6210\uFF1ADocker + compose + token + Kali + \u5411\u91CF");
    } catch (error) {
      showToast(`\u4E00\u952E\u5B89\u88C5\u5931\u8D25: ${error.message}`);
    } finally {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
      setBusy(false);
      await refresh();
    }
  };
  const uninstallAllPentagi = async () => {
    setBusy(true);
    setLogs(["=== \u4E00\u952E\u5378\u8F7D\u5168\u90E8\u540E\u7AEF\uFF1A\u5411\u91CF \u2192 compose down \u2192 \u5220\u955C\u50CF \u2192 \u5220\u6E90\u7801 ==="]);
    startPolling();
    try {
      const res = await fetch("/api/coldbrew/pentagi/uninstall-all", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (Array.isArray(data.logs) && data.logs.length > 0) setLogs(data.logs);
      if (data.isRunning) {
        showToast("\u6B63\u5728\u5378\u8F7D\u5168\u90E8\u540E\u7AEF\uFF0C\u770B\u4E0B\u9762\u65E5\u5FD7");
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "\u5378\u8F7D\u5931\u8D25");
      setPentagi(data);
      showToast("\u5168\u90E8\u540E\u7AEF\u5DF2\u5378\u8F7D\uFF1A\u5BB9\u5668/\u955C\u50CF/\u6E90\u7801/\u5411\u91CF\u90FD\u5DF2\u6E05\u7406");
    } catch (error) {
      showToast(`\u5378\u8F7D\u5931\u8D25: ${error.message}`);
    } finally {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
      setBusy(false);
      await refresh();
    }
  };
  const installDocker = async () => {
    setBusy(true);
    setLogs(["\u68C0\u67E5\u672C\u673A\u67B6\u6784\u5E76\u5B89\u88C5 Docker\uFF08Windows \u88C5 Docker Desktop\uFF0CmacOS \u8D70 Colima\uFF09\uFF0C\u968F\u540E\u62C9\u53D6 PentAGI \u955C\u50CF\u2026"]);
    startPolling();
    try {
      const res = await fetch("/api/coldbrew/pentagi/docker-install", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (Array.isArray(data.logs) && data.logs.length > 0) setLogs(data.logs);
      const detail = String(data.error || "").trim();
      if (data.isRunning && runningLooksLikeDocker(data)) {
        showToast("Docker \u6B63\u5728\u5B89\u88C5\uFF0C\u770B\u4E0B\u9762\u65E5\u5FD7\u5373\u53EF\uFF0C\u4E0D\u5FC5\u8FDE\u70B9");
        return;
      }
      if (!res.ok) throw new Error(detail || `HTTP ${res.status}`);
      setPentagi(data);
      showToast("Docker \u4F9D\u8D56\u5DF2\u5C31\u7EEA\uFF0C\u53EF\u4EE5\u542F\u52A8 PentAGI \u540E\u7AEF");
    } catch (error) {
      const text = String(error?.message ?? error);
      showToast(text.length > 80 ? `Docker \u5B89\u88C5\u5931\u8D25\uFF1A${text.slice(0, 80)}\u2026` : `Docker \u5B89\u88C5\u5931\u8D25\uFF1A${text}`);
    } finally {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
      setBusy(false);
      await refresh();
    }
  };
  const runEmbedder = async (op) => {
    setBusy(true);
    setLogs([op === "start" ? "\u5B89\u88C5/\u542F\u52A8\u672C\u673A\u5411\u91CF\uFF08\u7B2C\u4E00\u6B21\u4F1A pip + \u4E0B\u8F7D\u6A21\u578B\uFF09\u2026" : "\u505C\u6B62\u672C\u673A\u5411\u91CF\u670D\u52A1\u2026"]);
    startPolling();
    try {
      const res = await fetch("/api/coldbrew/pentagi/embedder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op })
      });
      const data = await res.json().catch(() => ({}));
      if (Array.isArray(data.logs) && data.logs.length > 0) setLogs(data.logs);
      if (!res.ok) throw new Error(data.error ?? "\u5411\u91CF\u670D\u52A1\u5931\u8D25");
      setPentagi(data);
      showToast(op === "start" ? "\u672C\u673A\u5411\u91CF\u5DF2\u542F\u52A8\uFF08\u7EA6 0.5GB\uFF09" : "\u672C\u673A\u5411\u91CF\u5DF2\u505C\u6B62");
      if (op === "start" && data.started?.installed) showToast("fastembed \u5DF2\u5B89\u88C5\uFF0C\u6A21\u578B\u5DF2\u5C31\u7EEA");
    } catch (error) {
      showToast(`\u5411\u91CF\u670D\u52A1\u5931\u8D25: ${error.message}`);
    } finally {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
      setBusy(false);
      await refresh();
    }
  };
  const stopPentagi = async () => {
    setBusy(true);
    setLogs(["\u505C\u6B62 PentAGI \u5B98\u65B9\u540E\u7AEF\u2026"]);
    startPolling();
    try {
      const res = await fetch("/api/coldbrew/pentagi/stop", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (Array.isArray(data.logs) && data.logs.length > 0) setLogs(data.logs);
      if (!res.ok) throw new Error(data.error ?? "\u505C\u6B62\u5931\u8D25");
      setPentagi(data);
      showToast("PentAGI \u5B98\u65B9\u540E\u7AEF\u5DF2\u505C\u6B62");
    } catch (error) {
      showToast(`\u505C\u6B62\u5931\u8D25: ${error.message}`);
    } finally {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
      setBusy(false);
      await refresh();
    }
  };
  if (loading && pentagi === null) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsm-empty", children: "\u6B63\u5728\u52A0\u8F7D PentAGI\u2026" });
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-root", children: [
    toast !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Toast, { text: toast.text, onDone: () => setToast(null) }, toast.seq),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: "PentAGI" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "\u5B98\u65B9 compose \u5B88\u62A4\u8FDB\u7A0B\u3001GraphQL \u901A\u884C\u8BC1\u3001Kali \u6C99\u7BB1\u548C\u8C03\u5EA6\u6A21\u578B\u3002\u7834\u7532\u6A21\u5F0F\u4ECD\u5728\u300C\u7834\u7532\u7BA1\u7406\u300D\u91CC\u5207\u6362\u3002" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsm-list", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      PentagiCard,
      {
        status: pentagi,
        busy,
        onProbe: () => {
          void refresh();
        },
        onStart: () => {
          void startPentagi();
        },
        onStop: () => {
          void stopPentagi();
        },
        onConfig: (patch) => {
          void savePentagiConfig(patch);
        },
        onSyncModels: () => {
          void syncPentagiModels();
        },
        onEmbedder: (op) => {
          void runEmbedder(op);
        },
        onInstallDocker: () => {
          void installDocker();
        },
        onInstallAll: () => {
          void installAllPentagi();
        },
        onUninstallAll: () => {
          void uninstallAllPentagi();
        }
      }
    ) }),
    (busy || logs.length > 0) && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "dsm-logs", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-logs-head", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u4EFB\u52A1\u5B9E\u65F6\u65E5\u5FD7" }),
        busy && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsm-logs-running", children: "\u6B63\u5728\u6267\u884C\u2026" })
      ] }),
      progress && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-progress", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsm-progress-bar", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsm-progress-fill", style: { width: `${progress.percent}%` } }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-progress-meta", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dsm-progress-label", children: [
            "\u7B2C ",
            progress.step,
            "/",
            progress.total,
            " \u6B65 \xB7 ",
            progress.label
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dsm-progress-pct", children: [
            progress.percent,
            "%"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dsm-progress-eta", children: [
            progress.etaSec === null ? "\u4F30\u7B97\u4E2D\u2026" : progress.etaSec === 0 ? "\u5373\u5C06\u5B8C\u6210" : progress.etaSec >= 60 ? `\u7EA6 ${Math.round(progress.etaSec / 60)} \u5206\u949F` : `\u7EA6 ${progress.etaSec} \u79D2`,
            progress.elapsedSec !== void 0 ? ` \xB7 \u5DF2\u7528 ${progress.elapsedSec} \u79D2` : ""
          ] })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        import_dsh_client_ui_primitives.TerminalBlock,
        {
          className: "dsm-terminal",
          command: "PentAGI \u540E\u7AEF",
          output: logs.length > 0 ? logs.join("\n") : "\u7B49\u5F85\u4EFB\u52A1\u5F00\u59CB\u2026",
          running: busy,
          labels: TERMINAL_LABELS
        }
      )
    ] })
  ] });
}
function ManagerSection() {
  const [profiles, setProfiles] = (0, import_react.useState)(null);
  const [status, setStatus] = (0, import_react.useState)({ installed: false, enabled: false, isRunning: false });
  const [online, setOnline] = (0, import_react.useState)(null);
  const [defaultOn, setDefaultOn] = (0, import_react.useState)(false);
  const [armorMode, setArmorMode] = (0, import_react.useState)("coldbrew");
  const [reverify, setReverify] = (0, import_react.useState)(null);
  const [logs, setLogs] = (0, import_react.useState)([]);
  const [loading, setLoading] = (0, import_react.useState)(true);
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [installingExtra, setInstallingExtra] = (0, import_react.useState)(null);
  const { toast, setToast, showToast } = useToast();
  const pollTimer = (0, import_react.useRef)(null);
  const fetchLogs = (0, import_react.useCallback)(async () => {
    try {
      const [desktopRes, reverifyRes] = await Promise.all([
        fetch("/api/desktop-manager/logs"),
        fetch("/api/coldbrew/reverify/logs")
      ]);
      const desktop = await desktopRes.json().catch(() => ({ logs: [], isRunning: false }));
      const reverifyLogs = await reverifyRes.json().catch(() => ({ logs: [], isRunning: false }));
      const merged = [
        ...Array.isArray(desktop.logs) ? desktop.logs : [],
        ...Array.isArray(reverifyLogs.logs) ? reverifyLogs.logs : []
      ];
      if (merged.length > 0) setLogs(merged);
      if (desktop.isRunning) {
        const sRes = await fetch("/api/desktop-manager/status");
        setStatus(await sRes.json());
      }
    } catch (error) {
      console.error("Failed to fetch logs", error);
    }
  }, []);
  const startPolling = (0, import_react.useCallback)(() => {
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = setInterval(fetchLogs, 500);
  }, [fetchLogs]);
  const refresh = (0, import_react.useCallback)(async () => {
    setLoading(true);
    try {
      const [profilesRes, statusRes] = await Promise.all([
        fetch("/api/coldbrew/profiles"),
        fetch("/api/desktop-manager/status")
      ]);
      const profilesData = await profilesRes.json();
      setProfiles(profilesData.profiles ?? []);
      setDefaultOn(profilesData.defaultEnabled === true);
      setArmorMode(profilesData.armorMode === "reverify" ? "reverify" : profilesData.armorMode === "pentagi" ? "pentagi" : "coldbrew");
      setReverify(profilesData.reverify ?? null);
      const statusData = await statusRes.json();
      setStatus(statusData);
      setOnline(true);
      if (statusData.isRunning) {
        setBusy(true);
        startPolling();
      }
    } catch (error) {
      console.error("Failed to fetch status", error);
      setOnline(false);
    } finally {
      setLoading(false);
    }
  }, [startPolling]);
  (0, import_react.useEffect)(() => {
    refresh();
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [refresh]);
  const toggleGlobalDefault = async (next) => {
    setDefaultOn(next);
    try {
      const res = await fetch("/api/coldbrew/default", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next })
      });
      if (!res.ok) throw new Error(await res.text());
      showToast(next ? "\u65B0\u4F1A\u8BDD\u5C06\u9ED8\u8BA4\u5F00\u542F\u7834\u7532" : "\u65B0\u4F1A\u8BDD\u5C06\u9ED8\u8BA4\u5173\u95ED\u7834\u7532");
    } catch (error) {
      setDefaultOn(!next);
      showToast(`\u8BBE\u7F6E\u5931\u8D25: ${error.message}`);
    }
  };
  const setArmorModeRemote = async (next) => {
    const previous = armorMode;
    setArmorMode(next);
    try {
      const res = await fetch("/api/coldbrew/mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: next })
      });
      if (!res.ok) throw new Error(await res.text());
      showToast(next === "reverify" ? "\u7A7A\u767D\u8F93\u5165\u6846\u4F1A\u7ACB\u523B\u53D8\u6210 Reverify\uFF1B\u5DF2\u804A\u8FC7\u7684\u4F1A\u8BDD\u8981\u65B0\u5F00\u4E00\u8F6E\u3002" : next === "pentagi" ? "\u7A7A\u767D\u8F93\u5165\u6846\u4F1A\u7ACB\u523B\u53D8\u6210 PentAGI\uFF1B\u5DF2\u804A\u8FC7\u7684\u4F1A\u8BDD\u8981\u65B0\u5F00\u4E00\u8F6E\u3002" : "\u7A7A\u767D\u8F93\u5165\u6846\u4F1A\u7ACB\u523B\u53D8\u6210\u51B7\u5496\u5561\uFF1B\u5DF2\u804A\u8FC7\u7684\u4F1A\u8BDD\u8981\u65B0\u5F00\u4E00\u8F6E\u3002");
    } catch (error) {
      setArmorMode(previous);
      showToast(`\u5207\u6362\u6A21\u5F0F\u5931\u8D25: ${error.message}`);
    }
  };
  const installReverify = async (extra) => {
    setBusy(true);
    setInstallingExtra(extra);
    setLogs([extra === "angr" ? "\u5F00\u59CB\u52A0\u88C5\u8C03\u7528\u56FE\u5F15\u64CE\u2026" : "\u5F00\u59CB\u5B89\u88C5\u9AD8\u7CBE\u5EA6\u5F15\u64CE\u2026"]);
    startPolling();
    try {
      const res = await fetch("/api/coldbrew/reverify/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extra })
      });
      const data = await res.json().catch(() => ({}));
      if (Array.isArray(data.logs) && data.logs.length > 0) setLogs(data.logs);
      if (!res.ok) throw new Error(data.error ?? "\u5B89\u88C5\u5931\u8D25");
      setReverify(data);
      showToast(extra === "angr" ? "\u8C03\u7528\u56FE\u5F15\u64CE\u5DF2\u88C5\u597D" : "\u9AD8\u7CBE\u5EA6\u5F15\u64CE\u5DF2\u88C5\u597D");
    } catch (error) {
      showToast(`\u5B89\u88C5\u5931\u8D25: ${error.message}`);
    } finally {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
      setInstallingExtra(null);
      setBusy(false);
      await refresh();
    }
  };
  const setProfileDefault = async (profileId, defaultEnabled) => {
    try {
      const res = await fetch(`/api/coldbrew/profile/${encodeURIComponent(profileId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: defaultEnabled })
      });
      if (!res.ok) throw new Error(await res.text());
      setProfiles((current) => current === null ? current : current.map((p) => p.id === profileId ? { ...p, defaultEnabled } : p));
    } catch (error) {
      showToast(`\u64CD\u4F5C\u5931\u8D25: ${error.message}`);
    }
  };
  const action = async (type) => {
    console.log(`[dsh-desktop-manager] Action: ${type}`);
    if (type === "restart") {
      const desktop = window.dshDesktop;
      if (typeof desktop?.restartHarness === "function") {
        await desktop.restartHarness();
        return;
      }
      window.parent.postMessage({ type: "deepseek-harness:restart" }, "*");
      return;
    }
    setBusy(true);
    setLogs([]);
    startPolling();
    try {
      const res = await fetch(`/api/desktop-manager/${type}`, { method: "POST" });
      const bodyText = await res.text();
      let payload = {};
      try {
        payload = JSON.parse(bodyText);
      } catch {
        payload = { error: bodyText };
      }
      if (Array.isArray(payload.logs) && payload.logs.length > 0) setLogs(payload.logs);
      if (!res.ok) throw new Error(payload.error || bodyText || `HTTP ${res.status}`);
      showToast(type === "install" ? "\u51B7\u5496\u5561 Zero \u5DF2\u5C31\u7EEA" : type === "uninstall" ? "\u5DF2\u505C\u7528\u51B7\u5496\u5561 Zero" : "\u8BBE\u7F6E\u5DF2\u66F4\u65B0");
      await refresh();
    } catch (error) {
      showToast(`\u64CD\u4F5C\u5931\u8D25: ${error.message}`);
    } finally {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
      setBusy(false);
    }
  };
  if (loading) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsm-empty", children: "\u6B63\u5728\u52A0\u8F7D\u7BA1\u7406\u754C\u9762\u2026" });
  const pluginState = !status.installed ? "error" : status.enabled ? "done" : "warning";
  const pluginStateText = !status.installed ? "\u5C1A\u672A\u5B89\u88C5" : status.enabled ? "\u5DF2\u542F\u7528" : "\u5DF2\u7981\u7528";
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-root", children: [
    toast !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Toast, { text: toast.text, onDone: () => setToast(null) }, toast.seq),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-hub", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-hub-head", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dsm-state", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            import_dsh_client_ui_primitives.StateDot,
            {
              state: online === null ? "warning" : online ? "done" : "error",
              size: 8
            }
          ),
          "\u540E\u7AEF ",
          online === null ? "\u68C0\u67E5\u4E2D\u2026" : online ? "\u8FD0\u884C\u4E2D" : "\u8FDE\u63A5\u5931\u8D25"
        ] }),
        busy && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dsm-state", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.StateDot, { state: "ongoing", size: 8 }),
          "\u4EFB\u52A1\u6267\u884C\u4E2D"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "dsm-default-toggle", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              type: "checkbox",
              checked: defaultOn,
              onChange: (event) => {
                void toggleGlobalDefault(event.target.checked);
              }
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u6240\u6709\u65B0\u4F1A\u8BDD\u9ED8\u8BA4\u5F00\u542F\u7834\u7532" })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-mode-row", role: "radiogroup", "aria-label": "\u5DE5\u4F5C\u6A21\u5F0F", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            className: "dsm-mode-chip",
            "data-on": armorMode === "coldbrew" || void 0,
            "aria-pressed": armorMode === "coldbrew",
            onClick: () => {
              void setArmorModeRemote("coldbrew");
            },
            children: "\u51B7\u5496\u5561 2.1.0"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            className: "dsm-mode-chip",
            "data-on": armorMode === "reverify" || void 0,
            "aria-pressed": armorMode === "reverify",
            onClick: () => {
              void setArmorModeRemote("reverify");
            },
            children: "Reverify 0.9.0"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            className: "dsm-mode-chip",
            "data-on": armorMode === "pentagi" || void 0,
            "aria-pressed": armorMode === "pentagi",
            onClick: () => {
              void setArmorModeRemote("pentagi");
            },
            children: "PentAGI 1.0.0"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsm-mode-hint", children: armorMode === "reverify" ? "\u4E4B\u540E\u65B0\u5F00\u7684\u5BF9\u8BDD\uFF0C\u4F1A\u5148\u6838\u5BF9\u6587\u4EF6\u518D\u4E0B\u7ED3\u8BBA\u3002" : armorMode === "pentagi" ? "\u4E4B\u540E\u65B0\u5F00\u7684\u5BF9\u8BDD\uFF0C\u4F1A\u6309\u6E17\u900F\u7F16\u6392\u65B9\u5F0F\u6267\u884C\u4EFB\u52A1\u3002" : "\u4E4B\u540E\u65B0\u5F00\u7684\u5BF9\u8BDD\uFF0C\u4F1A\u6309\u539F\u6765\u7684\u51B7\u5496\u5561\u65B9\u5F0F\u5DE5\u4F5C\u3002" })
      ] }),
      status.installed && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-note dsm-apply-note", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u66F4\u6539\u63D2\u4EF6\u542F\u7528\u72B6\u6001\u6216\u5B89\u88C5\u65B0\u63D2\u4EF6\u540E\uFF0C\u9700\u8981\u91CD\u542F\u540E\u7AEF\u670D\u52A1\uFF0C\u7CFB\u7EDF\u63D0\u793A\u8BCD\u624D\u4F1A\u91CD\u65B0\u52A0\u8F7D\u3002" }),
        !busy && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { onClick: () => action("restart"), variant: "primary", size: "sm", children: "\u91CD\u542F\u5E94\u7528" })
      ] }),
      !defaultOn && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsm-hub-hint", children: "\u4E0B\u9762\u53EF\u4EE5\u6309\u6A21\u578B\u5355\u72EC\u8BBE\u7F6E\uFF1A\u53EA\u6709\u65B0\u4F1A\u8BDD\u7528\u5230\u8BE5\u6A21\u578B\u65F6\uFF0C\u624D\u81EA\u52A8\u5F00\u542F\u7834\u7532\u3002" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsm-list", children: (profiles ?? []).map((profile) => {
        const effective = defaultOn || profile.defaultEnabled;
        const state = effective ? "done" : "warning";
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", { className: "dsm-card", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-card-main", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dsm-card-title", children: [
              profile.name,
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dsm-card-id", children: [
                profile.id,
                " \xB7 2.1.0"
              ] })
            ] }),
            PROFILE_MATCH_HINTS[profile.id] !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dsm-card-sub", children: [
              profile.short,
              " \xB7 ",
              PROFILE_MATCH_HINTS[profile.id]
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-card-side", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dsm-state", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.StateDot, { state, size: 8 }),
              defaultOn ? "\u5DF2\u7531\u603B\u5F00\u5173\u5F00\u542F" : profile.defaultEnabled ? "\u7528\u6B64\u6A21\u578B\u65F6\u9ED8\u8BA4\u5F00\u542F" : "\u7528\u6B64\u6A21\u578B\u65F6\u4E0D\u81EA\u52A8\u5F00\u542F"
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsm-actions", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              import_dsh_client_ui_primitives.Button,
              {
                onClick: () => void setProfileDefault(profile.id, !profile.defaultEnabled),
                disabled: busy || defaultOn,
                variant: profile.defaultEnabled ? "outline" : "primary",
                size: "sm",
                title: defaultOn ? "\u603B\u5F00\u5173\u5DF2\u5F00\u542F\uFF0C\u9010\u6A21\u578B\u8BBE\u7F6E\u6682\u4E0D\u751F\u6548" : void 0,
                children: profile.defaultEnabled ? "\u53D6\u6D88\u9ED8\u8BA4\u5F00\u542F" : "\u8BBE\u4E3A\u9ED8\u8BA4\u5F00\u542F"
              }
            ) })
          ] })
        ] }, profile.id);
      }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-list", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        ReverifyCard,
        {
          status: reverify,
          busy,
          installingExtra,
          onInstall: (extra) => {
            void installReverify(extra);
          },
          onProbe: () => {
            void refresh();
          }
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", { className: "dsm-card", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-card-main", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dsm-card-title", children: [
            "\u51B7\u5496\u5561 Zero 2.1.0",
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsm-card-id", children: "BREAK//OPEN" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "a",
            {
              className: "dsm-card-link",
              href: "https://github.com/3641397194-wq/gpt5.6-claude-grok4.6-deepseekv4pro",
              target: "_blank",
              rel: "noreferrer noopener",
              children: "github.com/3641397194-wq/gpt5.6-claude-grok4.6-deepseekv4pro"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dsm-state", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.StateDot, { state: pluginState, size: 8 }),
            pluginStateText
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsm-actions", children: !status.installed ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { onClick: () => action("install"), disabled: busy, variant: "primary", size: "sm", children: "\u4E00\u952E\u5B89\u88C5" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { onClick: () => action("toggle"), disabled: busy, variant: "primary", size: "sm", children: status.enabled ? "\u7981\u7528\u63D2\u4EF6" : "\u542F\u7528\u63D2\u4EF6" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { onClick: () => action("uninstall"), disabled: busy, variant: "outline", size: "sm", children: "\u5F7B\u5E95\u5378\u8F7D" })
        ] }) })
      ] })
    ] }),
    (busy || logs.length > 0) && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "dsm-logs", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsm-logs-head", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: installingExtra ? "\u5B89\u88C5\u5B9E\u65F6\u65E5\u5FD7" : "\u4EFB\u52A1\u5B9E\u65F6\u65E5\u5FD7" }),
        busy && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsm-logs-running", children: "\u6B63\u5728\u6267\u884C\u2026" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        import_dsh_client_ui_primitives.TerminalBlock,
        {
          className: "dsm-terminal",
          command: "\u684C\u9762\u7BA1\u7406\u4EFB\u52A1",
          output: logs.length > 0 ? logs.join("\n") : "\u7B49\u5F85\u4EFB\u52A1\u5F00\u59CB\u2026",
          running: busy,
          labels: TERMINAL_LABELS
        }
      )
    ] })
  ] });
}
function apply(ctx) {
  installStyles();
  ctx.effect(() => ctx.locale.register(NS, {
    zh: { "nav": "\u7834\u7532\u7BA1\u7406", "pentagiNav": "PentAGI" },
    en: { "nav": "Jailbreak", "pentagiNav": "PentAGI" }
  }), "dsh-desktop-manager: dictionaries");
  const t = ctx.locale.bind(NS);
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "desktop-manager",
    order: 100,
    label: () => t("nav"),
    locale: NS,
    inject: () => ({})
  }, ManagerSection));
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "pentagi",
    order: 110,
    label: () => t("pentagiNav"),
    locale: NS,
    inject: () => ({})
  }, PentagiSection));
  const registerToggle = (scope) => {
    const modelDirectories = typeof scope.get === "function" ? scope.get("modelDirectories") : void 0;
    scope.slots.inject("conversation.input.left", () => scope.slots.register({
      name: "conversation.input.left",
      id: "coldbrew-toggle",
      order: 10,
      locale: NS,
      inject: (sessionId) => {
        const id = sessionIdOf(sessionId);
        try {
          if (!id) return { directory: null, loadDirectory: () => {
          } };
          const directory = modelDirectories?.directoryFor(id);
          if (directory === void 0) return { directory: null, loadDirectory: () => {
          } };
          const loadDirectory = () => {
            directory.load?.().catch(() => {
            });
          };
          loadDirectory();
          return { directory: directory.store, loadDirectory };
        } catch {
          return { directory: null, loadDirectory: () => {
          } };
        }
      }
    }, ColdBrewToggle));
  };
  if (typeof ctx.inject === "function") ctx.inject(["modelDirectories"], registerToggle);
  else registerToggle(ctx);
}
return module.exports; } });
//# sourceMappingURL=client.js.map
