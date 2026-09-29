(() => {
  const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const visible = (element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
  };
  const absolute = (url) => {
    try { return new URL(url, location.href).href; } catch { return ""; }
  };
  const domain = (url) => {
    try { return new URL(url, location.href).hostname.toLowerCase(); } catch { return ""; }
  };
  const sameSite = (left, right) => {
    const root = (host) => String(host || "").split(".").slice(-2).join(".");
    return Boolean(root(left) && root(left) === root(right));
  };

  const SECRET_PATTERNS = [
    ["OpenAI-style API key", /\bsk-[A-Za-z0-9_-]{20,}\b/g, 0.78],
    ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/g, 0.97],
    ["GitHub token", /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/g, 0.95],
    ["private_key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, 0.99]
  ];

  function scanSecrets(text, source) {
    const matches = [];
    for (const [type, pattern, confidence] of SECRET_PATTERNS) {
      pattern.lastIndex = 0;
      for (const match of String(text || "").matchAll(pattern)) {
        const value = match[0];
        matches.push({
          type,
          source,
          confidence,
          redacted: value.length > 12 ? `${value.slice(0, 5)}…${value.slice(-4)}` : "[redacted]"
        });
        if (matches.length >= 20) return matches;
      }
    }
    return matches;
  }

  async function researchScriptSecrets(scripts) {
    const results = [];
    const sameOrigin = scripts.filter((script) => script.src && !script.external).slice(0, 8);
    for (const script of sameOrigin) {
      try {
        const response = await fetch(script.src, { credentials: "same-origin", cache: "force-cache" });
        const length = Number(response.headers.get("content-length") || 0);
        if (!response.ok || length > 2_000_000) continue;
        const text = (await response.text()).slice(0, 2_000_000);
        results.push(...scanSecrets(text, script.src));
      } catch {
        // An unavailable script is a limitation, not a security finding.
      }
    }
    return results.slice(0, 40);
  }

  async function collect(researchMode = false) {
    const pageDomain = location.hostname.toLowerCase();
    const scripts = [...document.scripts].slice(0, 150).map((node, index) => {
      const src = absolute(node.src);
      return {
        src,
        domain: domain(src),
        external: Boolean(src && !sameSite(pageDomain, domain(src))),
        integrity: node.integrity || "",
        crossOrigin: node.crossOrigin || "",
        async: node.async,
        defer: node.defer,
        type: node.type || "classic",
        inlineLength: src ? 0 : (node.textContent || "").length,
        index
      };
    });
    const inlineSecrets = [...document.scripts]
      .filter((node) => !node.src)
      .flatMap((node, index) => scanSecrets(node.textContent || "", `inline script ${index + 1}`))
      .slice(0, 40);
    const fetchedSecrets = researchMode ? await researchScriptSecrets(scripts) : [];
    const resources = performance.getEntriesByType("resource").slice(0, 250).map((entry) => ({
      url: entry.name,
      domain: domain(entry.name),
      initiatorType: entry.initiatorType,
      protocol: (() => { try { return new URL(entry.name).protocol; } catch { return ""; } })()
    }));
    const linkTargets = [...document.querySelectorAll("a[href]")].filter(visible).slice(0, 150).map((node) => {
      const href = absolute(node.href);
      return {
        text: normalize(node.innerText).slice(0, 160),
        href,
        domain: domain(href),
        target: node.target,
        rel: node.rel
      };
    });
    const buttons = [...document.querySelectorAll("button,[role='button'],input[type='submit']")]
      .filter(visible).slice(0, 75).map((node) => ({ text: normalize(node.innerText || node.value || node.getAttribute("aria-label")).slice(0, 160) }));
    const forms = [...document.forms].slice(0, 40).map((form) => {
      const inputs = [...form.querySelectorAll("input,select,textarea")];
      const labels = normalize(inputs.map((input) => `${input.name} ${input.autocomplete} ${input.getAttribute("aria-label") || ""}`).join(" ")).toLowerCase();
      const inputTypes = inputs.map((input) => (input.type || input.tagName).toLowerCase());
      const action = form.action || location.href;
      const actionDomain = domain(action);
      return {
        action,
        actionDomain,
        isExternalAction: Boolean(actionDomain && !sameSite(pageDomain, actionDomain)),
        method: (form.method || "get").toLowerCase(),
        inputTypes,
        asksForPassword: inputTypes.includes("password"),
        asksForPayment: /card|credit|cvv|cvc|expiry|billing/.test(labels),
        asksForSensitiveInformation: /social.?security|passport|seed phrase|one.?time|otp/.test(labels)
      };
    });
    const iframes = [...document.querySelectorAll("iframe")].slice(0, 50).map((frame) => {
      const src = absolute(frame.src);
      return {
        src,
        domain: domain(src),
        external: Boolean(src && !sameSite(pageDomain, domain(src))),
        sandbox: frame.getAttribute("sandbox") || "",
        allow: frame.getAttribute("allow") || ""
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
      text: normalize(document.body?.innerText).slice(0, 30000),
      url: location.href,
      domain: pageDomain,
      pageTitle: document.title,
      secureContext: window.isSecureContext,
      researchMode,
      linkTargets,
      buttons,
      forms,
      scripts,
      resources,
      iframes,
      secretMatches: [...inlineSecrets, ...fetchedSecrets],
      visibleWarnings: smallVisibleText,
      metaCsp: document.querySelector('meta[http-equiv="Content-Security-Policy" i]')?.content || "",
      domSignals: {
        precheckedConsent,
        countdown,
        javascriptLinks: document.querySelectorAll('a[href^="javascript:" i]').length,
        inlineEventHandlers: document.querySelectorAll("[onclick],[onload],[onerror],[onsubmit]").length
      },
      collectedAt: new Date().toISOString()
    };
  }

  const escapeHtml = (value) => String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);

  function showOverlay(result) {
    document.getElementById("laya-browser-guard-overlay")?.remove();
    const root = document.createElement("aside");
    root.id = "laya-browser-guard-overlay";
    const color = result.verdict === "HIGH_RISK" ? "#dc2626" : result.verdict === "SUSPICIOUS" ? "#d97706" : "#059669";
    root.style.cssText = `position:fixed;z-index:2147483647;right:20px;top:20px;width:360px;background:#0f172a;color:#f8fafc;border:1px solid ${color};border-radius:14px;box-shadow:0 20px 45px rgba(0,0,0,.35);padding:18px;font:14px/1.45 system-ui,sans-serif`;
    const evidence = (result.evidence || []).slice(0, 3).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    root.innerHTML = `<button id="laya-close" aria-label="Close" style="float:right;border:0;background:transparent;color:#fff;font-size:20px;cursor:pointer">×</button>
      <div style="font-weight:800;color:${color};letter-spacing:.05em">${escapeHtml(result.verdict.replaceAll("_", " "))}</div>
      <div style="font-size:28px;font-weight:800;margin:4px 0">${result.riskScore}/100 risk</div>
      <p style="color:#cbd5e1;margin:6px 0">${escapeHtml(result.explanation)}</p>
      ${evidence ? `<ul style="padding-left:20px;color:#e2e8f0">${evidence}</ul>` : ""}
      <div style="font-size:11px;color:#94a3b8;margin-top:10px">Passive local analysis • No form values collected</div>`;
    document.documentElement.appendChild(root);
    root.querySelector("#laya-close").addEventListener("click", () => root.remove());
  }

  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message?.type === "COLLECT_PAGE_CONTEXT") {
      collect(Boolean(message.researchMode)).then((context) => respond({ ok: true, context }))
        .catch((error) => respond({ ok: false, error: error.message }));
      return true;
    }
    if (message?.type === "SHOW_WARNING") {
      showOverlay(message.result);
      respond({ ok: true });
    }
    return false;
  });
})();