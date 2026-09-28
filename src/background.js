import { evaluatePageContext } from "./core/risk-engine.js";

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message?.type !== "ANALYZE_CONTEXT") return false;
  (async () => {
    try {
      const settings = await chrome.storage.local.get({ modelEnabled: false, retainResults: false });
      const result = await evaluatePageContext(message.context, settings);
      if (settings.retainResults) {
        await chrome.storage.local.set({ lastResult: { url: message.context.url, result } });
      }
      respond({ ok: true, result });
    } catch (error) {
      respond({ ok: false, error: error instanceof Error ? error.message : "Analysis failed" });
    }
  })();
  return true;
});