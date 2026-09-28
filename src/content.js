(() => {
  const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const visible = (element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
  };
  const domain = (href) => {
    try { return new URL(href, location.href).hostname.toLowerCase(); } catch { return ""; }
  };

  function collect() {
    const bodyText = normalize(document.body?.innerText).slice(0, 30000);
    const linkTargets = [...document.querySelectorAll("a[href]")].filter(visible).slice(0, 100).map((node) => {
      const href = node.href;
      return { text: normalize(node.innerText).slice(0, 160), href, domain: domain(href) };
    });
    const buttons = [...document.querySelectorAll("button,[role='button'],input[type='submit']")]
      .filter(visible).slice(0, 50).map((node) => ({ text: normalize(node.innerText || node.value || node.getAttribute("aria-label")).slice(0, 160) }));
    const forms = [...document.forms].slice(0, 25).map((form) => {
      const inputs = [...form.querySelectorAll("input,select,textarea")];
      const labels = normalize(inputs.map((input) => `${input.name} ${input.autocomplete} ${input.getAttribute("aria-label") || ""}`).join(" ")).toLowerCase();
      const inputTypes = inputs.map((input) => (input.type || input.tagName).toLowerCase());
      return {
        action: form.action || location.href,
        method: (form.method || "get").toLowerCase(),
        inputTypes,
        asksForPassword: inputTypes.includes("password"),
        asksForPayment: /card|credit|cvv|cvc|expiry|billing/.test(labels),
        asksForSensitiveInformation: /social.?security|passport|seed phrase|one.?time|otp/.test(labels)
      };
    });
    const smallVisibleText = [...document.querySelectorAll("small,[class*='fine'],[class*='terms'],[class*='disclaimer']")]
      .filter(visible).map((node) => normalize(node.innerText)).filter(Boolean).slice(0, 20);
    const precheckedConsent = [...document.querySelectorAll("input[type='checkbox']:checked")].some((input) => {
      const container = input.closest("label") || input.parentElement;
      return /subscribe|renew|marketing|consent|offer|trial/i.test(normalize(container?.innerText));
    });
    const countdown = [...document.querySelectorAll("[class*='countdown'],[id*='countdown'],time")]
      .filter(visible).some((node) => /\d{1,2}:\d{2}(?::\d{2})?/.test(normalize(node.innerText)));

    return {
      text: bodyText,
      url: location.href,
      domain: location.hostname.toLowerCase(),
      linkTargets,
      buttons,
      forms,
      pageTitle: document.title,
      visibleWarnings: smallVisibleText,
      domSignals: { precheckedConsent, countdown },
      collectedAt: new Date().toISOString()
    };
  }

  function showOverlay(result) {
    document.getElementById("laya-browser-guard-overlay")?.remove();
    const root = document.createElement("aside");
    root.id = "laya-browser-guard-overlay";
    const color = result.verdict === "HIGH_RISK" ? "#dc2626" : result.verdict === "SUSPICIOUS" ? "#d97706" : result.verdict === "SAFE" ? "#059669" : "#64748b";
    root.style.cssText = `position:fixed;z-index:2147483647;right:20px;top:20px;width:340px;background:#0f172a;color:#f8fafc;border:1px solid ${color};border-radius:14px;box-shadow:0 20px 45px rgba(0,0,0,.35);padding:18px;font:14px/1.45 system-ui,sans-serif`;
    const evidence = (result.evidence || []).slice(0, 3).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    root.innerHTML = `<button id="laya-close" aria-label="Close" style="float:right;border:0;background:transparent;color:#fff;font-size:20px;cursor:pointer">×</button>
      <div style="font-weight:800;color:${color};letter-spacing:.05em">${escapeHtml(result.verdict.replaceAll("_", " "))}</div>
      <div style="font-size:28px;font-weight:800;margin:4px 0">${result.riskScore}/100 risk</div>
      <p style="color:#cbd5e1;margin:6px 0">${escapeHtml(result.explanation)}</p>
      ${evidence ? `<ul style="padding-left:20px;color:#e2e8f0">${evidence}</ul>` : ""}
      <div style="font-size:11px;color:#94a3b8;margin-top:10px">Local analysis • No form values collected</div>`;
    document.documentElement.appendChild(root);
    root.querySelector("#laya-close").addEventListener("click", () => root.remove());
  }

  const escapeHtml = (value) => String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message?.type === "COLLECT_PAGE_CONTEXT") respond({ ok: true, context: collect() });
    if (message?.type === "SHOW_WARNING") {
      showOverlay(message.result);
      respond({ ok: true });
    }
  });
})();