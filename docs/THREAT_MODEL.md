# Threat model

## In scope

- Brand-impersonating and suspicious domains
- Misleading link labels and external destinations
- Credential or payment forms sent cross-site or over HTTP
- Deceptive urgency and scarcity
- Recurring-billing language and preselected subscription consent
- Common phishing pressure language

## Out of scope

- Malware binary analysis
- Reputation feeds and newly registered domain intelligence
- Network redirects that occur after analysis
- Guaranteed classification of fraud
- Content hidden inside cross-origin frames

The engine reports evidence and supports an insufficient-evidence outcome rather than forcing a binary claim.

## Model supply-chain controls

The model URL is pinned to an immutable Hugging Face revision. Large ONNX graphs and external-data files are verified using their published SHA-256 LFS identifiers before execution. Runtime JavaScript and WASM are bundled with the extension; no remotely hosted code is executed.