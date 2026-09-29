const SEVERITY_WEIGHT = { high: 30, medium: 14, low: 5, informational: 0 };
const ORDER = { high: 0, medium: 1, low: 2, informational: 3 };

const finding = (input) => ({
  confidence: 0.9,
  evidence: [],
  source: "deterministic",
  ...input
});

function headerFindings(snapshot) {
  if (!snapshot?.ok) return [];
  const headers = Object.fromEntries(Object.entries(snapshot.headers || {}).map(([key, value]) => [key.toLowerCase(), value]));
  const results = [];
  if (!headers["content-security-policy"]) {
    results.push(finding({
      id: "missing-csp", title: "Content-Security-Policy not observed", category: "security_headers",
      severity: "medium", confidence: 0.78, location: snapshot.finalUrl,
      evidence: ["The extension's public response-header check did not observe a Content-Security-Policy header."],
      whyItMatters: "CSP can restrict which scripts and resources execute, reducing the impact of some injection attacks.",
      recommendation: "Verify the actual navigation response in DevTools and deploy a restrictive, tested CSP if appropriate."
    }));
  } else if (/unsafe-inline|unsafe-eval/i.test(headers["content-security-policy"])) {
    results.push(finding({
      id: "weak-csp", title: "Content-Security-Policy permits risky script behavior", category: "security_headers",
      severity: "medium", location: snapshot.finalUrl,
      evidence: [`CSP contains ${/unsafe-eval/i.test(headers["content-security-policy"]) ? "'unsafe-eval'" : "'unsafe-inline'"}.`],
      whyItMatters: "Broad script allowances reduce CSP's protection against injected JavaScript.",
      recommendation: "Review whether nonces, hashes, and narrower source directives can replace broad script allowances."
    }));
  }
  if (!headers["x-content-type-options"]) {
    results.push(finding({
      id: "missing-nosniff", title: "X-Content-Type-Options not observed", category: "security_headers",
      severity: "low", confidence: 0.75, location: snapshot.finalUrl,
      evidence: ["The public response-header check did not observe X-Content-Type-Options: nosniff."],
      whyItMatters: "The header prevents browsers from interpreting resources as a different MIME type.",
      recommendation: "Confirm the navigation response and consider adding X-Content-Type-Options: nosniff."
    }));
  }
  if (!headers["referrer-policy"]) {
    results.push(finding({
      id: "missing-referrer-policy", title: "Referrer-Policy not observed", category: "privacy_headers",
      severity: "low", confidence: 0.75, location: snapshot.finalUrl,
      evidence: ["The public response-header check did not observe a Referrer-Policy header."],
      whyItMatters: "Referrer information can expose paths or query details to destination sites.",
      recommendation: "Review the application's referrer requirements and define an explicit policy."
    }));
  }
  if (snapshot.finalUrl?.startsWith("https:") && !headers["strict-transport-security"]) {
    results.push(finding({
      id: "missing-hsts", title: "Strict-Transport-Security not observed", category: "transport",
      severity: "low", confidence: 0.7, location: snapshot.finalUrl,
      evidence: ["The public HTTPS response did not include Strict-Transport-Security."],
      whyItMatters: "HSTS tells browsers to use HTTPS for future requests and helps resist protocol downgrade.",
      recommendation: "Verify all subdomains support HTTPS before deploying an appropriate HSTS policy."
    }));
  }
  return results;
}

function scriptFindings(context) {
  const results = [];
  const external = (context.scripts || []).filter((script) => script.external);
  const insecure = (context.scripts || []).filter((script) => script.src?.startsWith("http:"));
  if (insecure.length) {
    results.push(finding({
      id: "insecure-script", title: "Script loaded over HTTP", category: "mixed_content",
      severity: "high", location: insecure[0].src,
      evidence: insecure.slice(0, 5).map((script) => script.src),
      whyItMatters: "An attacker able to alter an insecure script response can execute code in the page.",
      recommendation: "Serve every executable resource over HTTPS and remove insecure fallbacks."
    }));
  }
  const withoutIntegrity = external.filter((script) => !script.integrity);
  if (withoutIntegrity.length) {
    results.push(finding({
      id: "external-scripts-no-sri", title: "External scripts without integrity metadata", category: "third_party_dependency",
      severity: "low", confidence: 0.85, location: context.url,
      evidence: withoutIntegrity.slice(0, 8).map((script) => script.src),
      whyItMatters: "Compromise of a third-party script host can affect every page that executes its code.",
      recommendation: "Inventory each third-party script. Where assets are versioned and stable, consider Subresource Integrity."
    }));
  }
  if (external.length) {
    results.push(finding({
      id: "third-party-scripts", title: `${external.length} third-party script source${external.length === 1 ? "" : "s"} observed`,
      category: "third_party_dependency", severity: "informational", confidence: 0.95, location: context.url,
      evidence: [...new Set(external.map((script) => script.domain))].slice(0, 12),
      whyItMatters: "Third-party JavaScript executes with the page's privileges and is part of its supply-chain attack surface.",
      recommendation: "Confirm that each domain is expected, maintained, and covered by vendor-risk controls."
    }));
  }
  return results;
}

function formFindings(context) {
  const results = [];
  for (const [index, form] of (context.forms || []).entries()) {
    const location = `Form ${index + 1}: ${form.action || context.url}`;
    if (form.asksForPassword && form.method === "get") {
      results.push(finding({
        id: `password-get-${index}`, title: "Password form uses GET", category: "credential_form",
        severity: "high", location, evidence: ["A password field is submitted with the GET method."],
        whyItMatters: "GET parameters can appear in URLs, history, logs, analytics, and referrer data.",
        recommendation: "Submit credentials with POST over HTTPS and prevent sensitive values from entering URLs."
      }));
    }
    if ((form.asksForPassword || form.asksForPayment) && form.action?.startsWith("http:")) {
      results.push(finding({
        id: `sensitive-http-form-${index}`, title: "Sensitive form submits over HTTP", category: "credential_form",
        severity: "high", location, evidence: [`Form action: ${form.action}`],
        whyItMatters: "Credentials or payment information sent over HTTP can be intercepted or modified.",
        recommendation: "Submit sensitive forms only to a verified HTTPS endpoint."
      }));
    }
    if ((form.asksForPassword || form.asksForPayment) && form.isExternalAction) {
      results.push(finding({
        id: `external-sensitive-form-${index}`, title: "Sensitive form submits to another domain", category: "credential_form",
        severity: "medium", location, evidence: [`Form destination: ${form.actionDomain}`],
        whyItMatters: "Cross-domain submission can be legitimate, but it expands the trust boundary for sensitive data.",
        recommendation: "Confirm the destination is an approved identity or payment provider and clearly disclose the handoff."
      }));
    }
  }
  return results;
}

function secretFindings(context) {
  const groups = new Map();
  for (const match of context.secretMatches || []) {
    const values = groups.get(match.type) || [];
    values.push(match);
    groups.set(match.type, values);
  }
  return [...groups.entries()].map(([type, matches]) => finding({
    id: `potential-secret-${type}`, title: `Potential exposed ${type}`, category: "secret_exposure",
    severity: type === "private_key" ? "high" : "medium", confidence: matches[0]?.confidence || 0.8,
    location: matches[0]?.source || context.url,
    evidence: matches.slice(0, 6).map((match) => `${match.source} (${match.redacted})`),
    whyItMatters: "Credentials embedded in browser-delivered code are available to every visitor and may be copied or abused.",
    recommendation: "Validate the match, revoke any live credential, remove it from client-delivered assets, and rotate related secrets."
  }));
}

function structuralFindings(context) {
  const results = [];
  const mixed = (context.resources || []).filter((resource) => context.url?.startsWith("https:") && resource.url?.startsWith("http:"));
  if (mixed.length) {
    results.push(finding({
      id: "mixed-resources", title: "Insecure resources referenced from an HTTPS page", category: "mixed_content",
      severity: "medium", location: context.url, evidence: mixed.slice(0, 8).map((resource) => resource.url),
      whyItMatters: "Insecure subresources can weaken confidentiality and integrity, even when the main page uses HTTPS.",
      recommendation: "Migrate resource URLs to HTTPS and remove hosts that cannot provide secure transport."
    }));
  }
  const unsandboxed = (context.iframes || []).filter((frame) => frame.external && !frame.sandbox);
  if (unsandboxed.length) {
    results.push(finding({
      id: "external-unsandboxed-iframes", title: "External iframe without sandbox restrictions", category: "embedded_content",
      severity: "low", location: unsandboxed[0].src, evidence: unsandboxed.slice(0, 6).map((frame) => frame.src),
      whyItMatters: "Embedded third-party documents increase the page's trust boundary.",
      recommendation: "Confirm the embeds are trusted and apply the narrowest practical sandbox and permissions policy."
    }));
  }
  if (context.domSignals?.javascriptLinks) {
    results.push(finding({
      id: "javascript-links", title: "javascript: links observed", category: "client_side_code",
      severity: "low", location: context.url, evidence: [`Count: ${context.domSignals.javascriptLinks}`],
      whyItMatters: "Inline script URLs complicate CSP deployment and can create injection-prone patterns.",
      recommendation: "Replace javascript: URLs with event listeners and validate any dynamic data used by handlers."
    }));
  }
  return results;
}

export function analyzeSecurityContext(context, headerSnapshot) {
  const findings = [
    ...secretFindings(context),
    ...formFindings(context),
    ...scriptFindings(context),
    ...structuralFindings(context),
    ...headerFindings(headerSnapshot)
  ].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);

  const score = Math.min(100, findings.reduce((sum, item) => sum + SEVERITY_WEIGHT[item.severity] * item.confidence, 0));
  const counts = { high: 0, medium: 0, low: 0, informational: 0 };
  for (const item of findings) counts[item.severity] += 1;
  const verdict = score >= 60 || counts.high >= 2 ? "HIGH_RISK" : score >= 25 || counts.high === 1 ? "SUSPICIOUS" : "SAFE";
  return {
    target: context.url,
    domain: context.domain,
    title: context.pageTitle,
    generatedAt: new Date().toISOString(),
    mode: context.researchMode ? "research" : "normal",
    verdict,
    riskScore: Math.round(score),
    counts,
    observationCount: findings.length,
    findings,
    limitations: [
      "Passive browser observations do not prove exploitability.",
      "Header checks use a separate public request and may differ from an authenticated navigation response.",
      "Cross-origin script bodies are not inspected."
    ]
  };
}

export function fuseModelEvaluation(report, model) {
  if (!model?.available) return { ...report, model };
  const fusedScore = Math.max(report.riskScore, Math.round(report.riskScore * 0.8 + model.riskScore * 0.2));
  return {
    ...report,
    riskScore: fusedScore,
    verdict: fusedScore >= 60 ? "HIGH_RISK" : fusedScore >= 25 ? "SUSPICIOUS" : report.verdict,
    model
  };
}
