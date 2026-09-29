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

const normalizedEndpoint = () => $("remote-endpoint").value.trim().replace(/\/$/, "");
async function grantEndpointAccess(endpoint) {
  const url = new URL(endpoint);
  if (url.protocol !== "https:") throw new Error("The Railway gateway must use HTTPS");
  const granted = await chrome.permissions.request({ origins: [`${url.origin}/*`] });
  if (!granted) throw new Error("Chrome did not grant access to the Railway gateway");
}

async function refresh() {
  const response = await chrome.runtime.sendMessage({ type: "MODEL_STATUS" });
  if (response?.ok) renderModelStatus(response.status);
}

async function load() {
  const settings = await chrome.storage.local.get({
    retainResults: false,
    researchMode: false,
    inferenceMode: "local",
    remoteEndpoint: "",
    remoteToken: ""
  });
  $("retain").checked = settings.retainResults;
  $("research").checked = settings.researchMode;
  $("inference-mode").value = settings.inferenceMode;
  $("remote-endpoint").value = settings.remoteEndpoint;
  $("remote-token").value = settings.remoteToken;
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

$("test-remote").addEventListener("click", async () => {
  try {
    const endpoint = normalizedEndpoint();
    if (!endpoint) throw new Error("Enter the Railway gateway URL first");
    await grantEndpointAccess(endpoint);
    $("remote-status").textContent = "Testing…";
    const response = await chrome.runtime.sendMessage({ type: "REMOTE_HEALTH", endpoint });
    if (!response?.ok) throw new Error(response?.error || "Gateway check failed");
    $("remote-status").textContent = response.health.jev_configured
      ? "Railway connected; official Jev is configured."
      : "Railway connected, but TYPESAFE_API_KEY is not configured.";
  } catch (error) {
    $("remote-status").textContent = error.message || "Gateway check failed";
  }
});

$("save").addEventListener("click", async () => {
  try {
    const inferenceMode = $("inference-mode").value;
    const endpoint = normalizedEndpoint();
    if (inferenceMode !== "local") {
      if (!endpoint) throw new Error("Railway URL is required for Remote or Hybrid mode");
      if (!$("remote-token").value) throw new Error("Gateway access token is required");
      await grantEndpointAccess(endpoint);
    }
    await chrome.storage.local.set({
      retainResults: $("retain").checked,
      researchMode: $("research").checked,
      inferenceMode,
      remoteEndpoint: endpoint,
      remoteToken: $("remote-token").value
    });
    $("status").textContent = "Saved";
    setTimeout(() => $("status").textContent = "", 1500);
  } catch (error) {
    $("status").textContent = error.message || "Unable to save";
  }
});

window.addEventListener("unload", () => clearInterval(poll));
load();