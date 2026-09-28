import { evaluatePageContext } from "./core/risk-engine.js";

async function ensureOffscreenDocument() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: "offscreen/offscreen.html",
    reasons: ["WORKERS"],
    justification: "Keep the user-approved local Laya model loaded for private page analysis."
  });
}

async function modelCommand(command, payload = {}) {
  await ensureOffscreenDocument();
  return chrome.runtime.sendMessage({
    type: "LAYA_MODEL_COMMAND",
    target: "offscreen",
    command,
    ...payload
  });
}

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message?.target === "offscreen") return false;
  (async () => {
    try {
      if (message?.type === "MODEL_PREPARE") {
        respond(await modelCommand("prepare"));
        return;
      }
      if (message?.type === "MODEL_DELETE") {
        respond(await modelCommand("delete"));
        return;
      }
      if (message?.type === "MODEL_STATUS") {
        const current = await chrome.storage.local.get({ modelStatus: { state: "not_downloaded" } });
        respond({ ok: true, status: current.modelStatus });
        return;
      }
      if (message?.type !== "ANALYZE_CONTEXT") return;

      const settings = await chrome.storage.local.get({ modelEnabled: false, retainResults: false });
      let modelEvaluation = null;
      if (settings.modelEnabled) {
        const response = await modelCommand("evaluate", { context: message.context });
        if (response?.ok) modelEvaluation = response.evaluation;
      }
      const result = await evaluatePageContext(message.context, { modelEvaluation });
      if (settings.retainResults) {
        await chrome.storage.local.set({ lastResult: { url: message.context.url, result } });
      }
      respond({ ok: true, result });
    } catch (error) {
      respond({ ok: false, error: error instanceof Error ? error.message : "Operation failed" });
    }
  })();
  return true;
});