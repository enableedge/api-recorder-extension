// panel.js (Enhanced UI with background colors, borders, better UX + Method & Status coloring)

const logEl = document.getElementById("log");
const filterEl = document.getElementById("filter");
let activeDomain = null;
let requestCount = 0;
const recordedRequests = []; // <-- Added to collect requests

// Export buttons
const exportBtn = document.createElement("button");
exportBtn.textContent = "📤 Export as Postman Collection";
exportBtn.style.margin = "10px";
exportBtn.style.padding = "5px 10px";
exportBtn.style.cursor = "pointer";
exportBtn.addEventListener("click", generatePostmanCollection);
document.body.prepend(exportBtn);

const exportPlaywrightBtn = document.createElement("button");
exportPlaywrightBtn.textContent = "🎭 Export as Playwright Tests";
exportPlaywrightBtn.style.margin = "10px";
exportPlaywrightBtn.style.padding = "5px 10px";
exportPlaywrightBtn.style.cursor = "pointer";
exportPlaywrightBtn.addEventListener("click", generatePlaywrightTests);
document.body.appendChild(exportPlaywrightBtn);

chrome.devtools.inspectedWindow.eval("window.location.hostname", (hostname) => {
  activeDomain = hostname;
});

function createElement(tag, className, content) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (content !== undefined) el.textContent = content;
  return el;
}

function formatHeaders(headers) {
  return headers
    .map((h) => {
      if (h.name.toLowerCase() === "authorization") {
        return `Authorization: ${h.value}`;
      }
      return `${h.name}: ${h.value}`;
    })
    .join("\n");
}

function prettyJSON(jsonStr) {
  try {
    return JSON.stringify(JSON.parse(jsonStr), null, 2);
  } catch (e) {
    return jsonStr;
  }
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(
    () => {
      alert("✅ cURL copied to clipboard!");
    },
    () => {
      alert("❌ Failed to copy");
    }
  );
}

function createToggleSection(titleText, contentElement) {
  const wrapper = createElement("div", "toggle-section");
  const toggleBtn = createElement("button", "toggle-btn");
  toggleBtn.innerHTML = `▶ ${titleText}`;

  contentElement.style.display = "none";
  toggleBtn.addEventListener("click", () => {
    const isVisible = contentElement.style.display === "block";
    contentElement.style.display = isVisible ? "none" : "block";
    toggleBtn.innerHTML = `${isVisible ? "▶" : "▼"} ${titleText}`;
  });

  wrapper.appendChild(toggleBtn);
  wrapper.appendChild(contentElement);
  return wrapper;
}

function shouldShowRequest(request) {
  const filterValue = filterEl?.value?.trim().toUpperCase();
  if (!filterValue) return true;
  return request.request.method.toUpperCase().includes(filterValue);
}

function getMethodColor(method) {
  switch (method.toUpperCase()) {
    case "GET":
      return "green";
    case "POST":
      return "blue";
    case "PUT":
      return "orange";
    case "DELETE":
      return "red";
    default:
      return "gray";
  }
}

function getStatusColor(status) {
  if (status >= 200 && status < 300) return "green";
  if (status >= 400 && status < 500) return "orange";
  if (status >= 500) return "red";
  return "gray";
}

chrome.devtools.network.onRequestFinished.addListener((request) => {
  if (request._resourceType !== "xhr") return;

  const url = request.request.url;
  const method = request.request.method;
  const status = request.response.status;

  try {
    const requestHost = new URL(url).hostname;
    if (!activeDomain || requestHost !== activeDomain) return;
  } catch (e) {
    return;
  }

  if (!shouldShowRequest(request)) return;

  request.getContent((body) => {
    requestCount++;

    recordedRequests.push({
      url,
      method,
      status,
      headers: Object.fromEntries(
        request.request.headers.map((h) => [h.name, h.value])
      ),
      body: body || "",
    });

    const container = createElement("div", "request-container");
    container.style.background = requestCount % 2 === 0 ? "#f5f5f5" : "#eaeaea";
    container.style.border = "1px solid #ccc";
    container.style.borderRadius = "8px";
    container.style.margin = "10px 0";
    container.style.padding = "10px";
    container.style.borderLeft = `8px solid ${getStatusColor(status)}`;

    const title = createElement(
      "h3",
      "request-title",
      `#${requestCount} — ${method} ${url}`
    );
    title.style.marginBottom = "8px";
    title.style.color = getMethodColor(method);
    container.appendChild(title);

    const reqHeadersContent = createElement(
      "pre",
      "request-headers",
      formatHeaders(request.request.headers)
    );
    const resHeadersContent = createElement(
      "pre",
      "response-headers",
      formatHeaders(request.response.headers || [])
    );
    const reqHeadersToggle = createToggleSection(
      "Request Headers",
      reqHeadersContent
    );
    const resHeadersToggle = createToggleSection(
      "Response Headers",
      resHeadersContent
    );

    const bodyTitle = createElement("strong", "section-label", "Request Body:");
    const bodyContent = createElement(
      "pre",
      "request-body",
      prettyJSON(body || "(empty)")
    );

    const curlCmd = [
      `curl -X ${method} \\\n`,
      `  '${url}'`,
      ...request.request.headers.map((h) => `  -H '${h.name}: ${h.value}'`),
      ...(body ? [`  -d '${body}'`] : []),
    ].join(" \\\n");

    const curlWrapper = createElement("div", "curl-wrapper");
    const copyBtn = createElement("button", "copy-btn", "📋 Copy cURL");
    copyBtn.addEventListener("click", () => copyToClipboard(curlCmd));
    curlWrapper.appendChild(copyBtn);

    container.appendChild(reqHeadersToggle);
    container.appendChild(resHeadersToggle);
    container.appendChild(bodyTitle);
    container.appendChild(bodyContent);
    container.appendChild(curlWrapper);

    logEl.appendChild(container);
  });
});

function generatePostmanCollection() {
  const items = recordedRequests.map((req) => {
    const urlObj = new URL(req.url);
    return {
      name: `${req.method} ${urlObj.pathname}`,
      request: {
        method: req.method,
        header: Object.entries(req.headers || {}).map(([key, value]) => ({
          key,
          value,
        })),
        url: {
          raw: req.url,
          host: [urlObj.hostname],
          path: urlObj.pathname.split("/").filter(Boolean),
          query: Array.from(urlObj.searchParams).map(([key, value]) => ({
            key,
            value,
          })),
        },
        body:
          req.method !== "GET" && req.body
            ? { mode: "raw", raw: req.body }
            : undefined,
      },
    };
  });

  const postmanCollection = {
    info: {
      name: "Recorded XHR Requests",
      schema:
        "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    item: items,
  };

  const blob = new Blob([JSON.stringify(postmanCollection, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "collection.json";
  a.click();
  URL.revokeObjectURL(url);
}

function generatePlaywrightTests() {
  if (!recordedRequests || recordedRequests.length === 0) {
    alert("No recorded requests to export.");
    return;
  }

  let testScript = `import { test, expect } from '@playwright/test';\n\n`;

  recordedRequests.forEach((req) => {
    const method = req.method || "GET";
    const url = req.url;
    const name = `Test ${method} ${new URL(url).pathname}`;
    let bodyBlock = "";
    if (method !== "GET" && req.body) {
      bodyBlock = `, {\n      data: ${JSON.stringify(
        req.body,
        null,
        2
      )}\n    }`;
    }
    const methodLower = method.toLowerCase();
    testScript += `test('${name}', async ({ request }) => {\n`;
    testScript += `  const response = await request.${methodLower}('${url}'${bodyBlock});\n`;
    testScript += `  expect(response.ok()).toBeTruthy();\n`;
    testScript += `});\n\n`;
  });

  const blob = new Blob([testScript], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "playwright-tests.spec.ts";
  a.click();
  URL.revokeObjectURL(url);
}
