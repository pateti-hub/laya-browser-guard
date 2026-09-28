import test from "node:test";
import assert from "node:assert/strict";
import { evaluatePageContext } from "../src/core/risk-engine.js";

const context = (changes = {}) => ({
  text: "Welcome to our documentation. Read the product guide.",
  url: "https://example.com/docs",
  domain: "example.com",
  linkTargets: [{ text: "Guide", href: "https://example.com/guide", domain: "example.com" }],
  buttons: [],
  forms: [],
  pageTitle: "Product documentation",
  visibleWarnings: [],
  domSignals: {},
  ...changes
});

test("returns safe for ordinary same-site content", async () => {
  const result = await evaluatePageContext(context());
  assert.equal(result.verdict, "SAFE");
  assert.ok(result.riskScore < 25);
});
test("detects a phishing combination", async () => {
  const result = await evaluatePageContext(context({
    url: "http://openai-account-support.xyz/login",
    domain: "openai-account-support.xyz",
    text: "Security alert. Verify your account immediately. Confirm your password.",
    forms: [{ action: "http://collector.example/submit", inputTypes: ["password"], asksForPassword: true }]
  }));
  assert.equal(result.verdict, "HIGH_RISK");
  assert.equal(result.isPhishing, true);
  assert.equal(result.asksForSensitiveInformation, true);
});
test("detects subscription traps with preselected consent", async () => {
  const result = await evaluatePageContext(context({
    text: "Start your free trial. Automatically renews and you will be charged monthly after the trial.",
    domSignals: { precheckedConsent: true }
  }));
  assert.equal(result.isSubscriptionTrap, true);
  assert.ok(result.riskTypes.includes("SUBSCRIPTION_TRAP"));
});
test("detects deceptive urgency", async () => {
  const result = await evaluatePageContext(context({
    text: "Act now. Limited time offer. Only 2 remaining.",
    domSignals: { countdown: true }
  }));
  assert.equal(result.hasDeceptiveUrgency, true);
  assert.ok(result.riskTypes.includes("DARK_PATTERN"));
});
test("does not treat identical promotional text as equally risky across domains", async () => {
  const text = "ChatGPT Plus free trial — click here.";
  const official = await evaluatePageContext(context({ text, url: "https://chatgpt.com", domain: "chatgpt.com" }));
  const fake = await evaluatePageContext(context({ text, url: "https://chatgpt-free-premium.xyz", domain: "chatgpt-free-premium.xyz" }));
  assert.ok(fake.riskScore > official.riskScore);
});
test("returns insufficient evidence for an empty page", async () => {
  const result = await evaluatePageContext(context({ text: "", pageTitle: "", linkTargets: [] }));
  assert.equal(result.verdict, "INSUFFICIENT_EVIDENCE");
});

test("fuses a model score without allowing it to erase deterministic risk", async () => {
  const risky = context({
    url: "http://openai-account-support.xyz/login",
    domain: "openai-account-support.xyz",
    text: "Security alert. Verify your account immediately. Confirm your password.",
    forms: [{ action: "http://collector.example", inputTypes: ["password"], asksForPassword: true }]
  });
  const baseline = await evaluatePageContext(risky);
  const fused = await evaluatePageContext(risky, {
    modelEvaluation: { available: true, provider: "test", riskScore: 0, decisions: {} }
  });
  assert.ok(fused.riskScore >= baseline.riskScore);
});

test("does not show elevated-risk wording when the final verdict is safe", async () => {
  const result = await evaluatePageContext(context(), {
    modelEvaluation: { available: true, provider: "test", riskScore: 80, decisions: {} }
  });
  assert.equal(result.verdict, "SAFE");
  assert.ok(!result.explanation.includes("elevated risk"));
  assert.ok(!result.evidence.some((item) => item.includes("elevated risk")));
});