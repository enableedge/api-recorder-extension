let port = chrome.runtime.connect({ name: "recorder" });
let allCapturedRequests = [];

document.addEventListener("DOMContentLoaded", async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabUrl = new URL(tabs[0].url);
  const baseDomain = getBaseDomain(tabUrl.hostname);

  chrome.storage.local.get(["isRecording", "capturedRequests"], (res) => {
    const isRecording = res.isRecording || false;
    document.getElementById("startBtn").disabled = isRecording;
    document.getElementById("stopBtn").disabled = !isRecording;
    // Restore filter values
    if (res.methodFilter)
      document.getElementById("methodFilter").value = res.methodFilter;
    if (res.searchFilter)
      document.getElementById("searchFilter").value = res.searchFilter;

    allCapturedRequests = res.capturedRequests || [];
    renderRequests();
  });

  document.getElementById("startBtn").onclick = () => {
    port.postMessage({ action: "start", domain: baseDomain });
    document.getElementById("startBtn").disabled = true;
    document.getElementById("stopBtn").disabled = false;
    allCapturedRequests = [];
    renderRequests();
  };

  document.getElementById("stopBtn").onclick = () => {
    port.postMessage({ action: "stop" });
    document.getElementById("startBtn").disabled = false;
    document.getElementById("stopBtn").disabled = true;
  };

  document.getElementById("methodFilter").addEventListener("change", (e) => {
    chrome.storage.local.set({ methodFilter: e.target.value });
    renderRequests();
  });

  document.getElementById("searchFilter").addEventListener("input", (e) => {
    chrome.storage.local.set({ searchFilter: e.target.value });
    renderRequests();
  });
});

port.onMessage.addListener((msg) => {
  if (msg.action === "update") {
    allCapturedRequests.push(msg.data);
    renderRequests();
  }

  if (msg.action === "export") {
    document.getElementById("output").textContent = msg.data.join("\n\n");
  }
});

function renderRequests() {
  const methodFilter = document.getElementById("methodFilter").value;
  const searchFilter = document
    .getElementById("searchFilter")
    .value.toLowerCase();

  const filtered = allCapturedRequests.filter((req) => {
    const methodMatches = methodFilter === "" || req.method === methodFilter;
    const text = (
      req.url + JSON.stringify(req.requestBody || "")
    ).toLowerCase();
    const searchMatches = text.includes(searchFilter);
    return methodMatches && searchMatches;
  });

  const list = document.getElementById("requestList");
  list.innerHTML = "";
  filtered.forEach((req) => {
    const li = document.createElement("li");
    li.textContent = `${req.method} ${req.url}`;
    if (req.requestBody) {
      const pre = document.createElement("pre");
      pre.textContent = `Body: ${req.requestBody}`;
      li.appendChild(pre);
    }

    if (req.headers?.length > 0) {
      const headersList = document.createElement("ul");
      headersList.textContent = "Headers:";
      req.headers.forEach((header) => {
        const h = document.createElement("li");
        h.textContent = `${header.name}: ${header.value}`;
        headersList.appendChild(h);
      });
      li.appendChild(headersList);
    }
  });
}

function getBaseDomain(hostname) {
  const parts = hostname.split(".");
  return parts.slice(-2).join(".");
}
