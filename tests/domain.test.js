import test from "node:test";
import assert from "node:assert/strict";
import { analyzeDomain, sameSite } from "../src/core/domain.js";

test("recognizes sibling subdomains as the same site", () => assert.equal(sameSite("login.example.com", "www.example.com"), true));
test("flags raw IP and HTTP", () => {
  const result = analyzeDomain("http://192.168.1.3/login");
  assert.equal(result.suspicious, true);
  assert.ok(result.score >= 40);
});
test("flags obvious brand impersonation", () => {
  const result = analyzeDomain("https://chatgpt-free-premium.xyz", "ChatGPT Plus free trial");
  assert.equal(result.suspicious, true);
  assert.ok(result.findings.some((item) => item.includes("imitate chatgpt")));
});
test("does not flag official ChatGPT domain", () => {
  const result = analyzeDomain("https://chatgpt.com", "ChatGPT Plus");
  assert.equal(result.suspicious, false);
});