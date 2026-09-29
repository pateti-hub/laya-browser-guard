const $ = (id) => document.getElementById(id);
let poll;

function renderModelStatus(status = { state: "not_downloaded" }) {
  const state = status.state || "not_downloaded";
  const labels = {
    not_downloaded: "Model is not downloaded.",
    downloading: `Downloading ${status.file || "model"}${status.percent == null ? "" : ` — ${status.percent}%`}`,
    verifying: `Verifying ${status.file || "model"}…`,
    verified: `Verified ${status.file || "model"}.`,
    ready: `Model ready (${Math.round((status.cachedBytes || 0) / 1024 / 1024)} MB cached).`,
    error: `Model error: ${status.error || "Unknown error"}`
  };
  $("model-status").textContent = labels[state] || state;
  $("progress").style.width = state === "ready" ? "100%" : `${status.percent || 0}%`;
  $("download").disabled = ["downloading", "verifying", "verified", "ready"].includes(state);
  $("delete").disabled = state === "not_downloaded";
}

async function refresh() {
  const response = await chrome.runtime.sendMessage({ type: "MODEL_STATUS" });
  if (response?.ok) renderModelStatus(response.status);
}

async function load() {
  const settings = await chrome.storage.local.get({ retainResults: false, researchMode: false });
  $("retain").checked = settings.retainResults;
  $("research").checked = settings.researchMode;
  await refresh();
  poll = setInterval(refresh, 800);
}

$("download").addEventListener("click", async () => {
  try {
    renderModelStatus({ state: "downloading", file: "initializing", percent: 0 });
    const response = await chrome.runtime.sendMessage({ type: "MODEL_PREPARE" });
    if (!response?.ok) throw new Error(response?.error || "Download failed");
    await refresh();
  } catch (error) {
    renderModelStatus({ state: "error", error: error.message || "Download failed" });
  }
});

$("delete").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "MODEL_DELETE" });
  await refresh();
});

$("save").addEventListener("click", async () => {
  await chrome.storage.local.set({
    retainResults: $("retain").checked,
    researchMode: $("research").checked
  });
  $("status").textContent = "Saved";
  setTimeout(() => $("status").textContent = "", 1500);
});

window.addEventListener("unload", () => clearInterval(poll));
load();