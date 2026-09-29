const RISKY_TLDS = new Set([
  "zip", "mov", "top", "xyz", "click", "country", "gq", "tk", "work", "support"
]);

const BRAND_DOMAINS = {
  chatgpt: ["chatgpt.com", "openai.com"],
  openai: ["openai.com", "chatgpt.com"],
  google: ["google.com"],
  microsoft: ["microsoft.com", "live.com", "office.com"],
  paypal: ["paypal.com"],
  amazon: ["amazon.com"],
  apple: ["apple.com", "icloud.com"],
  netflix: ["netflix.com"]
};

export function normalizeHost(value = "") {
  try {
    const input = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    return new URL(input).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return "";
  }
}

export function registrableDomain(host = "") {
  const parts = normalizeHost(host).split(".").filter(Boolean);
  return parts.length <= 2 ? parts.join(".") : parts.slice(-2).join(".");
}

export function sameSite(left, right) {
  const a = registrableDomain(left);
  const b = registrableDomain(right);
  return Boolean(a && b && a === b);
}

export function analyzeDomain(url, pageText = "") {
  const findings = [];
  let score = 0;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { score: 20, suspicious: true, findings: ["Invalid or unparseable page URL"] };
  }

  const host = normalizeHost(parsed.hostname);
  const labels = host.split(".");
  const tld = labels.at(-1) || "";

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    score += 35;
    findings.push("Page uses a raw IP address instead of a domain");
  }
  if (parsed.username || parsed.password) {
    score += 35;
    findings.push("URL contains misleading username or password components");
  }
  if (host.startsWith("xn--") || host.includes(".xn--")) {
    score += 20;
    findings.push("Domain uses internationalized punycode");
  }
  if (RISKY_TLDS.has(tld)) {
    score += 12;
    findings.push(`Domain uses the higher-risk .${tld} top-level domain`);
  }
  if (host.length > 45 || labels.length > 5) {
    score += 10;
    findings.push("Domain is unusually long or deeply nested");
  }
  if ((host.match(/-/g) || []).length >= 3) {
    score += 10;
    findings.push("Domain contains an unusual number of hyphens");
  }
  if (parsed.protocol !== "https:") {
    score += 12;
    findings.push("Page is not using HTTPS");
  }

  const corpus = `${host} ${pageText}`.toLowerCase();
  for (const [brand, officialDomains] of Object.entries(BRAND_DOMAINS)) {
    if (!corpus.includes(brand) || officialDomains.some((domain) => sameSite(host, domain))) continue;
    if (host.includes(brand)) {
      score += 28;
      findings.push(`Domain appears to imitate ${brand} without using an official domain`);
    }
  }

  return { score: Math.min(score, 60), suspicious: score >= 20, findings };
}

export function domainFromUrl(url = "") {
  try {
    return normalizeHost(new URL(url).hostname);
  } catch {
    return "";
  }
}