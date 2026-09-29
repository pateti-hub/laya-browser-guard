const $ = (id) => document.getElementById(id);
let report;

const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
};

function showDetail(item) {
  document.querySelectorAll(".finding").forEach((node) => node.classList.toggle("active", node.dataset.id === item.id));
  const detail = $("detail");
  detail.replaceChildren();
  detail.append(element("span", item.severity, `pill ${item.severity}`));
  detail.append(element("h3", item.title));
  detail.append(element("p", `${item.category.replaceAll("_", " ")} • Confidence ${Math.round(item.confidence * 100)}%`));
  detail.append(element("h4", "What we observed"));
  const evidence = element("ul");
  for (const value of item.evidence || []) evidence.append(element("li", value));
  detail.append(evidence);
  detail.append(element("h4", "Why this matters"));
  detail.append(element("p", item.whyItMatters));
  detail.append(element("h4", "Recommended investigation"));
  detail.append(element("p", item.recommendation));
  detail.append(element("h4", "Location"));
  detail.append(element("code", item.location || report.target));
}

function render() {
  $("empty").hidden = true;
  $("report").hidden = false;
  $("domain").textContent = report.domain || report.target;
  $("meta").textContent = `${report.observationCount} observations • ${report.mode} mode • ${new Date(report.generatedAt).toLocaleString()}`;
  $("score").textContent = `${report.riskScore}/100`;
  $("verdict").textContent = report.verdict.replaceAll("_", " ");
  $("verdict").style.color = report.verdict === "HIGH_RISK" ? "#f87171" : report.verdict === "SUSPICIOUS" ? "#fb923c" : "#34d399";
  for (const key of ["high", "medium", "low", "informational"]) $(key).textContent = report.counts[key] || 0;
  const findings = $("findings");
  findings.replaceChildren();
  for (const item of report.findings) {
    const button = element("button", null, "finding");
    button.dataset.id = item.id;
    button.append(element("span", item.severity, `pill ${item.severity}`));
    button.append(element("b", item.title));
    button.append(element("small", `${item.category.replaceAll("_", " ")} • ${Math.round(item.confidence * 100)}% confidence`));
    button.addEventListener("click", () => showDetail(item));
    findings.append(button);
  }
  $("limitations").replaceChildren(...report.limitations.map((text) => element("li", text)));
  if (report.findings[0]) showDetail(report.findings[0]);
}

$("export").addEventListener("click", () => {
  if (!report) return;
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `security-report-${report.domain || "website"}-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});

(async () => {
  const session = await chrome.storage.session.get("latestSecurityReport");
  const local = session.latestSecurityReport ? {} : await chrome.storage.local.get("lastSecurityReport");
  report = session.latestSecurityReport || local.lastSecurityReport;
  if (!report) {
    $("empty").hidden = false;
    return;
  }
  render();
})();