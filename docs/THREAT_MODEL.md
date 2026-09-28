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