import { analyzeDomain, domainFromUrl, sameSite } from "./domain.js";
import { LocalModelAdapter } from "./model-adapter.js";

const PATTERNS = {
  subscription: [
    /\bfree trial\b/i, /\bauto(?:matic(?:ally)?)? renew/i, /\brecurring (?:payment|charge|billing)\b/i,
    /\bafter (?:the )?trial\b/i, /\bcancel (?:anytime|before)\b/i, /\bcharged (?:monthly|annually)\b/i
  ],
  urgency: [
    /\bact now\b/i, /\blimited time\b/i, /\bexpires? (?:today|soon|in)\b/i,
    /\bonly \d+ (?:left|remaining)\b/i, /\bimmediately\b/i, /\baccount (?:will be )?(?:closed|suspended|locked)\b/i
  ],
  phishing: [
    /\bverify your (?:account|identity)\b/i, /\bconfirm your (?:password|identity|account)\b/i,
    /\bunusual (?:login|activity)\b/i, /\bsecurity alert\b/i, /\bclaim (?:your )?(?:reward|prize)\b/i
  ],
  sensitive: [
    /\bpassword\b/i, /\bcredit card\b/i, /\bcard number\b/i, /\bcvv\b/i,
    /\bsocial security\b/i, /\bone[- ]time password\b/i, /\bseed phrase\b/i
  ],
  darkPattern: [
    /\bno thanks,? i (?:don'?t|do not) want\b/i, /\baccept all\b/i,
    /\bconfirmshaming\b/i, /\bcountdown\b/i, /\bpreselected\b/i
  ]
};

const countMatches = (text, patterns) => patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);

function analyzeLinks(context) {
  let score = 0;
  const findings = [];
  const links = Array.isArray(context.linkTargets) ? context.linkTargets : [];
  const pageDomain = context.domain || domainFromUrl(context.url);
  const external = links.filter((link) => link.domain && !sameSite(pageDomain, link.domain));

  if (links.length >= 4 && external.length / links.length > 0.8) {
    score += 8;
    findings.push("Most page links lead to other domains");
  }

  for (const link of links.slice(0, 100)) {
    const label = String(link.text || "").toLowerCase();
    if (/https?:\/\/|www\./.test(label)) {
      const displayed = domainFromUrl(label.match(/(?:https?:\/\/|www\.)[^\s]+/)?.[0] || "");
      if (displayed && link.domain && !sameSite(displayed, link.domain)) {
        score += 20;
        findings.push(`Displayed link destination differs from its actual destination (${link.domain})`);
        break;
      }
    }
    if (/^(?:javascript|data):/i.test(link.href || "")) {
      score += 8;
      findings.push("Page contains a disguised script or data link");
      break;
    }
  }
  return { score: Math.min(score, 25), findings };
}

function analyzeForms(context) {
  let score = 0;
  const findings = [];
  let sensitive = false;
  const pageDomain = context.domain || domainFromUrl(context.url);

  for (const form of context.forms || []) {
    const types = form.inputTypes || [];
    const asksPassword = Boolean(form.asksForPassword || types.includes("password"));
    const asksPayment = Boolean(form.asksForPayment);
    sensitive ||= asksPassword || asksPayment || Boolean(form.asksForSensitiveInformation);
    const actionDomain = domainFromUrl(form.action);

    if (asksPassword) score += 12;
    if (asksPayment) score += 12;
    if ((asksPassword || asksPayment) && actionDomain && !sameSite(pageDomain, actionDomain)) {
      score += 28;
      findings.push(`Sensitive form submits to another domain (${actionDomain})`);
    }
    if ((asksPassword || asksPayment) && /^http:\/\//i.test(form.action || "")) {
      score += 25;
      findings.push("Sensitive form submits over an insecure connection");
    }
  }
  if (context.domSignals?.precheckedConsent) {
    score += 12;
    findings.push("A consent or subscription checkbox is preselected");
  }
  return { score: Math.min(score, 45), findings, sensitive };
}

export async function evaluatePageContext(context, options = {}) {
  const text = [
    context.pageTitle,
    context.text,
    ...(context.visibleWarnings || []),
    ...(context.buttons || []).map((button) => button.text)
  ].filter(Boolean).join(" ").slice(0, 50000);

  const domain = analyzeDomain(context.url, text);
  const links = analyzeLinks(context);
  const forms = analyzeForms(context);
  const subscriptions = countMatches(text, PATTERNS.subscription);
  const urgency = countMatches(text, PATTERNS.urgency);
  const phishing = countMatches(text, PATTERNS.phishing);
  const sensitiveLanguage = countMatches(text, PATTERNS.sensitive);
  const darkPatterns = countMatches(text, PATTERNS.darkPattern);

  const isSubscriptionTrap = subscriptions >= 2 || (subscriptions >= 1 && Boolean(context.domSignals?.precheckedConsent));
  const hasDeceptiveUrgency = urgency >= 2 || (urgency >= 1 && Boolean(context.domSignals?.countdown));
  const asksForSensitiveInformation = forms.sensitive || sensitiveLanguage >= 2;
  const isPhishing = phishing >= 1 && (asksForSensitiveInformation || domain.suspicious || links.score >= 20);

  let score = domain.score + links.score + forms.score;
  score += Math.min(subscriptions * 6, 18);
  score += Math.min(urgency * 6, 18);
  score += Math.min(phishing * 9, 27);
  score += Math.min(darkPatterns * 5, 15);
  if (isPhishing) score += 18;
  score = Math.min(Math.round(score), 100);

  const findings = [
    ...domain.findings,
    ...links.findings,
    ...forms.findings
  ];
  if (isSubscriptionTrap) findings.push("Trial or subscription language suggests recurring billing risk");
  if (hasDeceptiveUrgency) findings.push("Page applies multiple urgency or scarcity cues");
  if (isPhishing) findings.push("Account-pressure language is combined with sensitive or suspicious signals");
  if (context.domSignals?.countdown) findings.push("Page contains a countdown-style element");

  const evidenceCount = text.trim().length > 20
    ? 1 + (context.linkTargets?.length || 0) + (context.forms?.length || 0)
    : 0;
  let verdict = "SAFE";
  if (evidenceCount === 0) verdict = "INSUFFICIENT_EVIDENCE";
  else if (score >= 65) verdict = "HIGH_RISK";
  else if (score >= 25) verdict = "SUSPICIOUS";

  const riskTypes = [];
  if (isSubscriptionTrap) riskTypes.push("SUBSCRIPTION_TRAP");
  if (isPhishing) riskTypes.push("PHISHING");
  if (hasDeceptiveUrgency || darkPatterns || context.domSignals?.precheckedConsent) riskTypes.push("DARK_PATTERN");

  const model = await new LocalModelAdapter({ enabled: options.modelEnabled }).evaluate(context);
  return {
    verdict,
    riskScore: score,
    isSubscriptionTrap,
    hasDeceptiveUrgency,
    isPhishing,
    asksForSensitiveInformation,
    isDomainSuspicious: domain.suspicious,
    riskTypes,
    evidence: [...new Set(findings)].slice(0, 8),
    explanation: findings[0] || (verdict === "SAFE"
      ? "No strong risk signals were detected in the available page evidence."
      : "The page did not provide enough visible evidence for a reliable assessment."),
    model,
    analyzedAt: new Date().toISOString()
  };
}