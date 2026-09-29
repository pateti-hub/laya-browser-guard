export const QUESTIONS = {
  meaningfulConcern: {
    type: "noul",
    instructions: "Does this collection of passive browser observations indicate a meaningful security concern that merits developer or researcher review?"
  },
  needsManualReview: {
    type: "noul",
    instructions: "Should a human security reviewer investigate these observations rather than dismissing them as ordinary website behavior?"
  },
  evidenceQuality: {
    type: "choice",
    instructions: "How strong is the available evidence for a security-relevant conclusion?",
    criteria: ["strong", "moderate", "weak", "insufficient"]
  },
  category: {
    type: "choice",
    instructions: "Choose the primary category represented by the observations.",
    criteria: [
      "secret exposure",
      "transport or security configuration",
      "third-party dependency",
      "credential or payment form",
      "deceptive or social engineering",
      "informational"
    ]
  },
  severity: {
    type: "score",
    instructions: "Score the security-review priority. Do not assume exploitability from passive observations alone.",
    criteria: ["informational", "low", "medium", "high", "critical"]
  }
};

export function compactContext(context) {
  return {
    page: {
      title: context.pageTitle,
      url: context.url,
      domain: context.domain,
      secure_context: context.secureContext
    },
    relevant_text: String(context.text || "").slice(0, 7000),
    forms: (context.forms || []).slice(0, 15),
    scripts: (context.scripts || []).slice(0, 40),
    resources: (context.resources || []).slice(0, 60),
    iframes: (context.iframes || []).slice(0, 20),
    potential_secret_types: [...new Set((context.secretMatches || []).map((match) => match.type))],
    visible_warnings: (context.visibleWarnings || []).slice(0, 15),
    dom_signals: context.domSignals || {}
  };
}

export function normalizeModelEvaluation(answers) {
  const concern = answers.meaningfulConcern?.noul ?? 0;
  const review = answers.needsManualReview?.noul ?? 0;
  const severity = Math.min(100, Math.max(0, (answers.severity?.score ?? 0) * 25));
  const evidenceQuality = answers.evidenceQuality?.choice || "insufficient";
  const qualityWeight = { strong: 1, moderate: 0.8, weak: 0.5, insufficient: 0.2 }[evidenceQuality] || 0.2;
  return {
    available: true,
    provider: "laya-web-q8",
    revision: "a1f49ac3c927b2e694a074af081d043adaa0fda1",
    riskScore: Math.round((concern * 35 + review * 20 + severity * 0.45) * qualityWeight),
    category: answers.category?.choice || "informational",
    evidenceQuality,
    decisions: { meaningfulConcern: concern, needsManualReview: review },
    raw: answers
  };
}