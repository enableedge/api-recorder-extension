(function () {
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const [resource, config] = args;
    const method = config?.method || "GET";
    const body = config?.body || null;

    const response = await originalFetch(...args);
    const clone = response.clone();

    clone.text().then((respBody) => {
      window.postMessage(
        {
          __API_RECORDER__: {
            type: "fetch",
            method,
            url: typeof resource === "string" ? resource : resource.url,
            requestBody: body,
            responseBody: respBody,
            status: clone.status,
          },
        },
        "*"
      );
    });

    return response;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this._method = method;
    this._url = url;
    return origOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function (body) {
    this.addEventListener("load", function () {
      window.postMessage(
        {
          __API_RECORDER__: {
            type: "xhr",
            method: this._method,
            url: this._url,
            requestBody: body,
            responseBody: this.responseText,
            status: this.status,
          },
        },
        "*"
      );
    });
    return origSend.apply(this, arguments);
  };
})();
