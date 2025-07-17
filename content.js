window.addEventListener("message", (event) => {
  if (event.source !== window || !event.data.__API_RECORDER__) return;

  const data = event.data.__API_RECORDER__;
  chrome.runtime.sendMessage({ type: "api_record", payload: data });
});
