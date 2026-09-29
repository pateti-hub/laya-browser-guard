# Laya Website Security Copilot

A passive, local-first Chrome extension that helps developers and authorized security researchers understand a website's browser-visible attack surface. It combines deterministic checks with typed Laya decisions, evidence, educational explanations, and recommended investigation steps.

## Current capabilities

- Browser-visible script, resource, iframe, link, form and DOM inventory
- Mixed-content and insecure script checks
- Credential and payment-form transport checks
- Third-party script and Subresource Integrity observations
- Potential secret-pattern detection with automatic redaction
- Supplemental public response-header review for CSP, HSTS, nosniff and Referrer-Policy
- Severity, confidence, evidence, impact and recommended investigation for every finding
- Full security dashboard with JSON report export
- Optional Research Mode for bounded same-origin JavaScript inspection
- In-page warning overlay
- Local-only, click-to-analyze privacy model
- Optional Laya Q8 ONNX interpretation of structured technical evidence
- User-approved model download, progress UI, SHA-256 verification and local cache

## Install for development

1. Clone the repository and run `npm ci`.
2. Run `npm run build`.
3. Open `chrome://extensions`.
4. Enable **Developer mode**.
5. Select **Load unpacked** and choose the generated `dist` directory.
6. Open extension settings to download and enable the optional 528 MB model.
7. Open a webpage, click the extension, and select **Analyze this website**.

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
  ├─ DOM, forms, links, iframes and scripts
  ├─ Performance API resource inventory
  ├─ redacted secret-pattern observations
  └─ supplemental public header snapshot
       └─ deterministic security engine
            ├─ transport and mixed-content checks
            ├─ credential-form checks
            ├─ dependency and embedding checks
            └─ security-header checks
                 └─ optional local Laya typed decisions
                      └─ evidence fusion
                           ├─ popup summary and page overlay
                           └─ security dashboard + JSON report
```

## Model integration status

The extension uses the English `nvkudva/laya-web-q8` checkpoint pinned to revision `a1f49ac3c927b2e694a074af081d043adaa0fda1`. The model is downloaded only after informed user action, validated against published SHA-256 hashes, and cached locally. Inference uses ONNX Runtime Web over WASM. The deterministic engine remains available when the model is missing or cannot load.

## Privacy and limitations

- The extension does not inspect entered form values.
- Analysis is triggered by the user and limited to the active page.
- Research Mode fetches only a bounded number of same-origin script files and never executes active tests.
- Cross-origin script bodies are not inspected.
- Evidence is not transmitted to a backend. Enabling the model downloads static model files from Hugging Face.
- Header checks use a separate public request and may differ from an authenticated navigation response.
- Findings are observations for authorized review; they do not prove exploitability.

See [Privacy](docs/PRIVACY.md), [Security](SECURITY.md), and the [threat model](docs/THREAT_MODEL.md).