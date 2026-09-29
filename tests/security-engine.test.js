import test from "node:test";
import assert from "node:assert/strict";
import { analyzeSecurityContext, fuseModelEvaluation } from "../src/security-engine/security-engine.js";

const page = (changes = {}) => ({
  url: "https://example.com/login",
  domain: "example.com",
  pageTitle: "Example",
  scripts: [],
  resources: [],
  forms: [],
  iframes: [],
  secretMatches: [],
  domSignals: {},
  ...changes
});

test("detects password submission through GET", () => {
  const report = analyzeSecurityContext(page({
    forms: [{
      action: "https://example.com/login",
      method: "get",
      asksForPassword: true,
      asksForPayment: false,
      isExternalAction: false
    }]
  }), { ok: false });
  assert.equal(report.counts.high, 1);
  assert.ok(report.findings.some((item) => item.id === "password-get-0"));
});

test("detects insecure scripts and mixed resources", () => {
  const report = analyzeSecurityContext(page({
    scripts: [{ src: "http://cdn.example.net/app.js", domain: "cdn.example.net", external: true, integrity: "" }],
    resources: [{ url: "http://cdn.example.net/app.js", initiatorType: "script" }]
  }), { ok: false });
  assert.ok(report.findings.some((item) => item.id === "insecure-script"));
  assert.ok(report.findings.some((item) => item.id === "mixed-resources"));
});

test("groups secret-shaped observations without exposing full values", () => {
  const report = analyzeSecurityContext(page({
    secretMatches: [{ type: "AWS access key", source: "/app.js", confidence: 0.97, redacted: "AKIA…ABCD" }]
  }), { ok: false });
  const exposed = report.findings.find((item) => item.id === "potential-secret-AWS access key");
  assert.ok(exposed);
  assert.ok(exposed.evidence[0].includes("AKIA…ABCD"));
});

test("reports missing headers only after a successful header snapshot", () => {
  const unavailable = analyzeSecurityContext(page(), { ok: false });
  const available = analyzeSecurityContext(page(), { ok: true, finalUrl: "https://example.com", headers: {} });
  assert.ok(!unavailable.findings.some((item) => item.id === "missing-csp"));
  assert.ok(available.findings.some((item) => item.id === "missing-csp"));
});

test("model fusion cannot lower deterministic risk", () => {
  const report = analyzeSecurityContext(page({
    forms: [{ action: "http://example.com", method: "get", asksForPassword: true, asksForPayment: false, isExternalAction: false }]
  }), { ok: false });
  const fused = fuseModelEvaluation(report, { available: true, riskScore: 0 });
  assert.ok(fused.riskScore >= report.riskScore);
});
