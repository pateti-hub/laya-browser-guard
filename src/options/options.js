async function load() {
  const settings = await chrome.storage.local.get({ retainResults: false, modelEnabled: false });
  document.getElementById("retain").checked = settings.retainResults;
  document.getElementById("model").checked = settings.modelEnabled;
}
document.getElementById("save").addEventListener("click", async () => {
  await chrome.storage.local.set({ retainResults: document.getElementById("retain").checked, modelEnabled: false });
  document.getElementById("status").textContent = "Saved";
  setTimeout(() => document.getElementById("status").textContent = "", 1500);
});
load();