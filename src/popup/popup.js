const $ = (id) => document.getElementById(id);
let activeTab;
let latestResult;

async function analyze() {
  $("idle").hidden = true; $("result").hidden = true; $("error").hidden = true; $("loading").hidden = false;
  try {
    [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.id || !/^https?:/i.test(activeTab.url || "")) throw new Error("Open a normal website before running the analysis.");
    await chrome.scripting.executeScript({ target: { tabId: activeTab.id }, files: ["src/content.js"] });
    const collected = await chrome.tabs.sendMessage(activeTab.id, { type: "COLLECT_PAGE_CONTEXT" });
    if (!collected?.ok) throw new Error("Could not collect page evidence.");
    const analyzed = await chrome.runtime.sendMessage({ type: "ANALYZE_CONTEXT", context: collected.context });
    if (!analyzed?.ok) throw new Error(analyzed?.error || "Analysis failed.");
    latestResult = analyzed.result;
    render(latestResult);
  } catch (error) {
    $("error").textContent = error.message || "Unable to analyze this page.";
    $("error").hidden = false; $("idle").hidden = false;
  } finally { $("loading").hidden = true; }
}

function render(result) {
  const colors = { HIGH_RISK: "#ef4444", SUSPICIOUS: "#f59e0b", SAFE: "#10b981", INSUFFICIENT_EVIDENCE: "#94a3b8" };
  const color = colors[result.verdict];
  $("verdict").textContent = result.verdict.replaceAll("_", " ");
  $("verdict").style.color = color; $("score").textContent = `${result.riskScore}/100`;
  $("meter").style.width = `${result.riskScore}%`; $("meter").style.background = color;
  $("explanation").textContent = result.explanation;
  $("evidence").replaceChildren(...result.evidence.map((text) => Object.assign(document.createElement("li"), { textContent: text })));
  $("result").hidden = false;
}

$("analyze").addEventListener("click", analyze);
$("again").addEventListener("click", analyze);
$("show").addEventListener("click", async () => {
  if (activeTab?.id && latestResult) await chrome.tabs.sendMessage(activeTab.id, { type: "SHOW_WARNING", result: latestResult });
  window.close();
});