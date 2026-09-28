import test from "node:test";
import assert from "node:assert/strict";
import { buildSequence, pyJsonDumps, renderOptions, toInternal } from "../src/model/sequence.js";
import { softmax, temperatureFor } from "../src/model/postprocess.js";
import { compactContext, normalizeModelEvaluation } from "../src/model/decisions.js";

const tokenizer = {
  maskToken: "[MASK]",
  maskTokenId: 4,
  clsTokenId: 1,
  sepTokenId: 2,
  padTokenId: 0,
  encode: (text) => [...text].map((character) => character.codePointAt(0) % 97 + 5)
};

test("serializes state with Python-style separators", () => {
  assert.equal(pyJsonDumps({ safe: true, items: [1, "x"] }, false), '{"safe": true, "items": [1, "x"]}');
});

test("builds marker positions for every decision option", () => {
  const question = toInternal({ type: "choice", instructions: "Risk?", criteria: ["safe", "high risk"] });
  assert.deepEqual(renderOptions(question), ["safe", "high risk"]);
  const sequence = buildSequence(tokenizer, { domain: "example.com" }, question, 512, 192);
  assert.equal(sequence.markers.length, 2);
  assert.ok(sequence.ids.length <= 512);
  assert.equal(sequence.ids[0], tokenizer.clsTokenId);
});

test("softmax is normalized and temperature buckets are selected", () => {
  const probabilities = softmax([1, 2, 3]);
  assert.ok(Math.abs(probabilities.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.equal(temperatureFor({ temperature: [1, 2, 3], temperature_by_options: { "choice:3-5": 0.5 } }, 0, 4), 0.5);
});

test("compacts page context before model inference", () => {
  const compact = compactContext({
    pageTitle: "Test", url: "https://example.com", domain: "example.com",
    text: "x".repeat(12000), linkTargets: [], buttons: [], forms: [], visibleWarnings: [], domSignals: {}
  });
  assert.equal(compact.relevant_text.length, 9000);
});

test("normalizes typed answers into a bounded model risk score", () => {
  const evaluation = normalizeModelEvaluation({
    isSubscriptionTrap: { noul: 0.8 },
    hasDeceptiveUrgency: { noul: 0.7 },
    isPhishing: { noul: 0.9 },
    asksForSensitiveInformation: { noul: 0.8 },
    isDomainSuspicious: { noul: 0.9 },
    overallRisk: { choice: "high risk" },
    severity: { score: 3.5 }
  });
  assert.equal(evaluation.available, true);
  assert.ok(evaluation.riskScore >= 60 && evaluation.riskScore <= 100);
});