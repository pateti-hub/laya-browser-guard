# Privacy

Laya Website Security Copilot analyzes the active page only after the user clicks **Analyze this website**.

It reads visible text, resource URLs, script metadata, link destinations, button labels, form metadata, iframe metadata and limited DOM indicators. It does **not** read input values, passwords, payment values, cookies, browsing history or content from other tabs. Potential secret matches are redacted before they enter a report.

Research Mode may fetch up to eight same-origin JavaScript files, with a two-megabyte limit per file, solely to identify secret-shaped patterns. It does not inspect cross-origin script bodies, execute tests, submit forms, or modify the target.

Evidence remains in the browser. Retaining the latest result is off by default and can be enabled in settings.

The optional model requires a one-time download of approximately 528 MB from Hugging Face after explicit user action. Only static model files are requested; page evidence is never included in those requests. Model files are stored in browser Cache Storage and can be deleted from settings.