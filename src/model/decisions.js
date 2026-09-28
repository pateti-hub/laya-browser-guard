export const QUESTIONS = {
  isSubscriptionTrap: { type: "noul", instructions: "Does the page use a deceptive free trial, hidden recurring charge, difficult cancellation, or subscription trap?" },
  hasDeceptiveUrgency: { type: "noul", instructions: "Does the page pressure the user with deceptive urgency, scarcity, countdowns, or threats?" },
  isPhishing: { type: "noul", instructions: "Does the evidence indicate phishing, impersonation, credential theft, or a malicious account-verification request?" },
  asksForSensitiveInformation: { type: "noul", instructions: "Does the page request passwords, payment details, identity numbers, one-time codes, or other sensitive information in a risky context?" },
  isDomainSuspicious: { type: "noul", instructions: "Is the page domain or a destination domain suspicious, misleading, insecure, or impersonating a trusted brand?" },
  overallRisk: {
    type: "choice",
    instructions: "Choose the best overall risk classification from the available evidence. Use insufficient evidence when the evidence cannot support a reliable conclusion.",
    criteria: ["safe", "suspicious", "high risk", "insufficient evidence"]
  },
  severity: {
    type: "score",
    instructions: "Score the severity of fraud, phishing, subscription, or deceptive-design risk.",
    criteria: ["none", "low", "medium", "high", "critical"]
  }
};

export function compactContext(context) {
  return {
    page: { title: context.pageTitle, url: context.url, domain: context.domain },
    relevant_text: String(context.text || "").slice(0, 9000),
    link_targets: (context.linkTargets || []).slice(0, 30),
    buttons: (context.buttons || []).slice(0, 20),
    forms: (context.forms || []).slice(0, 10),
    visible_warnings: (context.visibleWarnings || []).slice(0, 20),
    dom_signals: context.domSignals || {}
  };
}

export function normalizeModelEvaluation(answers) {
  const decisions = Object.fromEntries(
    ["isSubscriptionTrap", "hasDeceptiveUrgency", "isPhishing", "asksForSensitiveInformation", "isDomainSuspicious"]
      .map((key) => [key, answers[key]?.noul ?? 0])
  );
  const booleanMean = Object.values(decisions).reduce((sum, value) => sum + value, 0) / 5;
  const severity = Math.min(100, Math.max(0, (answers.severity?.score ?? 0) * 25));
  const choice = answers.overallRisk?.choice;
  const choiceScores = { safe: 0, suspicious: 45, "high risk": 85, "insufficient evidence": 20 };
  return {
    available: true,
    provider: "laya-web-q8",
    revision: "a1f49ac3c927b2e694a074af081d043adaa0fda1",
    riskScore: Math.round(booleanMean * 35 + severity * 0.45 + (choiceScores[choice] ?? 20) * 0.2),
    verdict: choice,
    decisions,
    raw: answers
  };
}