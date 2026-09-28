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
- Optional Laya Q8 ONNX model with typed decisions and deterministic fallback
- User-approved model download, progress UI, SHA-256 verification and local cache

## Install for development

1. Clone the repository and run `npm ci`.
2. Run `npm run build`.
3. Open `chrome://extensions`.
4. Enable **Developer mode**.
5. Select **Load unpacked** and choose the generated `dist` directory.
6. Open extension settings to download and enable the optional 528 MB model.
7. Open a webpage, click the extension, and select **Analyze this page**.

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

The extension uses the English `nvkudva/laya-web-q8` checkpoint pinned to revision `a1f49ac3c927b2e694a074af081d043adaa0fda1`. The model is downloaded only after informed user action, validated against published SHA-256 hashes, and cached locally. Inference uses ONNX Runtime Web over WASM. The deterministic engine remains available when the model is missing or cannot load.

## Privacy and limitations

- The extension does not inspect entered form values.
- Analysis is triggered by the user and limited to the active page.
- Evidence is not transmitted to a backend. Enabling the model downloads static model files from Hugging Face.
- Results are advisory and cannot guarantee that a page is safe or fraudulent.

See [Privacy](docs/PRIVACY.md), [Security](SECURITY.md), and the [threat model](docs/THREAT_MODEL.md).