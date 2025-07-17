let isRecording = false;
let domainFilter = "";
let capturedRequests = [];
const capturedRequestsMap = new Map();

// Load persisted state
chrome.runtime.onStartup.addListener(loadState);
chrome.runtime.onInstalled.addListener(loadState);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "start") {
    isRecording = true;
    domainFilter = msg.domain;
    capturedRequests = [];
    chrome.storage.local.set({ isRecording, domainFilter, capturedRequests });
    sendResponse({ status: "recording started" });
  }

  if (msg.action === "stop") {
    isRecording = false;
    chrome.storage.local.set({ isRecording });

    const curlList = capturedRequests.map(convertToCurl);
    sendResponse({ action: "export", data: curlList });

    chrome.storage.local.remove(["capturedRequests"]);
  }
});

// Capture request headers
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (!isRecording) return;
    const req = capturedRequestsMap.get(details.requestId) || {};
    req.headers = details.requestHeaders;
    capturedRequestsMap.set(details.requestId, req);
  },
  { urls: ["<all_urls>"] },
  ["requestHeaders", "extraHeaders"]
);

// Capture request details
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (
      !isRecording ||
      (details.type !== "xmlhttprequest" && details.type !== "fetch")
    )
      return;

    const hostname = new URL(details.url).hostname;
    if (!hostname.endsWith(domainFilter)) return;

    const existing = capturedRequestsMap.get(details.requestId) || {};

    const req = {
      requestId: details.requestId,
      method: details.method,
      url: details.url,
      headers: existing.headers || [],
      requestBody: extractBody(details),
    };

    if (req.headers.length > 0) {
      capturedRequests.push(req);
      capturedRequestsMap.delete(details.requestId);
      chrome.storage.local.set({ capturedRequests });
    } else {
      capturedRequestsMap.set(details.requestId, req);
    }
  },
  { urls: ["<all_urls>"] },
  ["requestBody"]
);

// Decode request body
function extractBody(details) {
  try {
    if (details.requestBody?.raw?.[0]?.bytes) {
      return new TextDecoder().decode(details.requestBody.raw[0].bytes);
    }
  } catch (e) {}
  return null;
}

// Convert to curl command
function convertToCurl({ method, url, headers, requestBody }) {
  let curl = `curl -X ${method} "${url}"`;
  if (headers && headers.length > 0) {
    headers.forEach((h) => {
      if (h.name.toLowerCase() !== "content-length") {
        curl += ` \\\n  -H "${h.name}: ${h.value}"`;
      }
    });
  }
  if (requestBody) {
    curl += ` \\\n  -d '${requestBody}'`;
  }
  return curl;
}

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
