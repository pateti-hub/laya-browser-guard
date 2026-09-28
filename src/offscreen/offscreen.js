import { compactContext, normalizeModelEvaluation, QUESTIONS } from "../model/decisions.js";
import { cachedModelBytes, deleteModelCache, LayaSession, MODEL_REVISION } from "../model/session.js";

let sessionPromise;
const setStatus = (status) => chrome.storage.local.set({
  modelStatus: { revision: MODEL_REVISION, updatedAt: new Date().toISOString(), ...status }
});

async function prepare() {
  if (!sessionPromise) {
    sessionPromise = LayaSession.load(async (progress) => {
      const percent = progress.total ? Math.round(progress.loaded / progress.total * 100) : null;
      await setStatus({ state: progress.phase, file: progress.file, loaded: progress.loaded, total: progress.total, percent });
    }).then(async (session) => {
      await chrome.storage.local.set({ modelEnabled: true });
      await setStatus({ state: "ready", cachedBytes: await cachedModelBytes() });
      return session;
    }).catch(async (error) => {
      sessionPromise = undefined;
      await setStatus({ state: "error", error: error.message });
      throw error;
    });
  }
  return sessionPromise;
}

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message?.type !== "LAYA_MODEL_COMMAND" || message.target !== "offscreen") return false;
  (async () => {
    try {
      if (message.command === "prepare") {
        await prepare();
        respond({ ok: true, status: (await chrome.storage.local.get("modelStatus")).modelStatus });
      } else if (message.command === "evaluate") {
        const session = await prepare();
        const answers = await session.systemOne(compactContext(message.context), QUESTIONS);
        respond({ ok: true, evaluation: normalizeModelEvaluation(answers) });
      } else if (message.command === "delete") {
        sessionPromise = undefined;
        await deleteModelCache();
        await chrome.storage.local.set({ modelEnabled: false });
        await setStatus({ state: "not_downloaded", cachedBytes: 0 });
        respond({ ok: true });
      }
    } catch (error) {
      respond({ ok: false, error: error instanceof Error ? error.message : "Model operation failed" });
    }
  })();
  return true;
});