# Privacy

Laya Browser Guard analyzes the active page only after the user clicks **Analyze this page**.

It reads visible text, link destinations, button labels, form metadata and limited DOM indicators. It does **not** read input values, passwords, payment values, cookies, browsing history or content from other tabs. Evidence remains in the browser. Retaining the latest result is off by default and can be enabled in settings.

The optional model requires a one-time download of approximately 528 MB from Hugging Face after explicit user action. Only static model files are requested; page evidence is never included in those requests. Model files are stored in browser Cache Storage and can be deleted from settings.