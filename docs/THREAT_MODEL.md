# Threat model

## In scope

- Mixed content and insecure executable resources
- Third-party script and iframe trust boundaries
- Potential client-delivered secret patterns
- Missing or permissive security headers
- Credential or payment forms sent cross-site or over HTTP
- Client-side patterns that complicate restrictive CSP deployment
- Browser-visible domain, link, form, script, iframe and resource evidence

## Out of scope

- Malware binary analysis
- Reputation feeds and newly registered domain intelligence
- Exploitation, vulnerability verification, port scanning or active probing
- Complete network interception or authenticated response-header guarantees
- Cross-origin script-body inspection
- Content hidden inside cross-origin frames

The engine reports passive observations and recommended investigation. A finding does not prove exploitability.

## Model supply-chain controls

The model URL is pinned to an immutable Hugging Face revision. Large ONNX graphs and external-data files are verified using their published SHA-256 LFS identifiers before execution. Runtime JavaScript and WASM are bundled with the extension; no remotely hosted code is executed.