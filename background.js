let isRecording = false;
let domainFilter = "";
let capturedRequests = [];
let popupPort = null;
const requestHeadersMap = new Map();

chrome.runtime.onConnect.addListener((port) => {
  popupPort = port;

  port.onMessage.addListener((msg) => {
    if (msg.action === "start") {
      isRecording = true;
      domainFilter = msg.domain;
      capturedRequests = [];
      chrome.storage.local.set({ isRecording, domainFilter, capturedRequests });
    }

    if (msg.action === "stop") {
      isRecording = false;
      chrome.storage.local.set({ isRecording });

      const curlList = capturedRequests.map(convertToCurl);
      port.postMessage({ action: "export", data: curlList });

      chrome.storage.local.remove(["capturedRequests"]);
    }
  });
});

// Listen for messages from content scripts
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (!isRecording) return;
    requestHeadersMap.set(details.requestId, details.requestHeaders);
  },
  { urls: ["<all_urls>"] },
  ["requestHeaders"]
);

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (!isRecording || details.type !== "xmlhttprequest") return;

    const hostname = new URL(details.url).hostname;
    if (!hostname.endsWith(domainFilter)) return;

    const headers = requestHeadersMap.get(details.requestId) || [];

    const req = {
      requestId: details.requestId,
      method: details.method,
      url: details.url,
      headers,
      requestBody: extractBody(details), // helper below
    };

    capturedRequests.push(req);
    chrome.storage.local.set({ capturedRequests });
    popupPort?.postMessage({ action: "update", data: req });
  },
  { urls: ["<all_urls>"] },
  ["requestBody"]
);

// Helper to safely decode request body
function extractBody(details) {
  try {
    if (details.requestBody?.raw?.[0]?.bytes) {
      return new TextDecoder().decode(details.requestBody.raw[0].bytes);
    }
  } catch (e) {}
  return null;
}

function convertToCurl({ method, url, headers, requestBody }) {
  let curl = `curl -X ${method} "${url}"`;

  // Add headers
  if (headers && headers.length > 0) {
    headers.forEach((h) => {
      if (h.name.toLowerCase() !== "content-length") {
        curl += ` \\\n  -H "${h.name}: ${h.value}"`;
      }
    });
  }

  // Add body
  if (requestBody) {
    curl += ` \\\n  -d '${requestBody}'`;
  }

  return curl;
}

// Persist state when popup closes
chrome.runtime.onStartup.addListener(loadState);
chrome.runtime.onInstalled.addListener(loadState);

function loadState() {
  chrome.storage.local.get(
    ["isRecording", "domainFilter", "capturedRequests"],
    (res) => {
      isRecording = res.isRecording || false;
      domainFilter = res.domainFilter || "";
      capturedRequests = res.capturedRequests || [];
    }
  );
}
