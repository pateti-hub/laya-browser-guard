import { analyzeSecurityContext, fuseModelEvaluation } from "./security-engine/security-engine.js";

async function inspectHeaders(url) {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return { ok: false, error: "Unsupported protocol" };
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      cache: "no-store",
      credentials: "omit"
    });
    const names = [
      "content-security-policy",
      "strict-transport-security",
      "x-content-type-options",
      "referrer-policy",
      "permissions-policy",
      "cross-origin-opener-policy",
      "cross-origin-resource-policy"
    ];
    return {
      ok: true,
      status: response.status,
      finalUrl: response.url || url,
      headers: Object.fromEntries(names.map((name) => [name, response.headers.get(name)]).filter(([, value]) => value))
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Header request failed" };
  }
}

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
      if (message?.type === "MODEL_STATUS_UPDATE" && message.target === "background") {
        const update = { modelStatus: message.status };
        if (typeof message.modelEnabled === "boolean") update.modelEnabled = message.modelEnabled;
        await chrome.storage.local.set(update);
        respond({ ok: true });
        return;
      }
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
        try {
          const response = await modelCommand("evaluate", { context: message.context });
          if (response?.ok) modelEvaluation = response.evaluation;
        } catch {
          // Deterministic checks remain available when the optional model cannot run.
        }
      }
      const headerSnapshot = await inspectHeaders(message.context.url);
      const deterministicReport = analyzeSecurityContext(message.context, headerSnapshot);
      const report = fuseModelEvaluation(deterministicReport, modelEvaluation);
      const primary = report.findings[0];
      const result = {
        verdict: report.verdict,
        riskScore: report.riskScore,
        explanation: primary?.title || "No significant passive security observations were detected.",
        evidence: primary?.evidence?.length
          ? primary.evidence.slice(0, 5)
          : report.findings.slice(0, 5).map((item) => item.title),
        model: report.model,
        report
      };
      await chrome.storage.session.set({ latestSecurityReport: report });
      if (settings.retainResults) {
        await chrome.storage.local.set({ lastResult: { url: message.context.url, result }, lastSecurityReport: report });
      }
      respond({ ok: true, result });
    } catch (error) {
      respond({ ok: false, error: error instanceof Error ? error.message : "Operation failed" });
    }
  })();
  return true;
});