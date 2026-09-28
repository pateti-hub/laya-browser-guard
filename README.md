# Laya Browser Guard

A privacy-first Chrome extension that evaluates **text, domains, link destinations, forms, buttons and DOM signals** together. It identifies possible phishing, subscription traps and deceptive patterns without uploading page content.

## Current capabilities

- Explicit `SAFE`, `SUSPICIOUS`, `HIGH_RISK` and `INSUFFICIENT_EVIDENCE` outcomes
- Domain, TLD, HTTPS, punycode and brand-impersonation checks
- Displayed-link versus destination checks
- Sensitive form destination and transport checks
- Subscription, urgency, phishing and dark-pattern signals
- Preselected consent and countdown detection
- Risk score, evidence and plain-language explanation
- In-page warning overlay
- Local-only, click-to-analyze privacy model
- Laya/Jev adapter boundary with a deterministic fallback

## Install for development

1. Clone the repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Select **Load unpacked** and choose the repository root.
5. Open a webpage, click the extension, and select **Analyze this page**.

No dependency installation or build step is required.

## Test and package

```bash
npm test
npm run verify
npm run package
```

The package command creates `laya-browser-guard.zip`.

## Architecture

```text
Active webpage
  └─ evidence collector (text, URLs, buttons, forms, DOM signals)
       └─ deterministic risk engine
            ├─ domain and link analysis
            ├─ subscription/phishing/dark-pattern analysis
            ├─ optional local Laya/Jev adapter
            └─ structured risk result + browser overlay
```

## Model integration status

The extension is fully functional with deterministic local analysis. The Laya/Jev adapter is intentionally disabled until a compatible model artifact, tokenizer, license and browser runtime requirements are supplied. No unverified latency claim is made.

## Privacy and limitations

- The extension does not inspect entered form values.
- Analysis is triggered by the user and limited to the active page.
- Evidence is not transmitted to a backend.
- Results are advisory and cannot guarantee that a page is safe or fraudulent.

See [Privacy](docs/PRIVACY.md), [Security](SECURITY.md), and the [threat model](docs/THREAT_MODEL.md).