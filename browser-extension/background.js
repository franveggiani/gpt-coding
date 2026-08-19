chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || !["fetchTask", "ackTask"].includes(message.type)) {
    return false;
  }

  const { port, sessionId, token } = message;
  if (!Number.isInteger(port) || port <= 0 || port > 65535 || !sessionId || !token) {
    sendResponse({ ok: false, error: "invalid_bridge_parameters" });
    return false;
  }

  const path = message.type === "fetchTask" ? "task" : "ack";
  const url = `http://127.0.0.1:${port}/${path}/${encodeURIComponent(sessionId)}?token=${encodeURIComponent(token)}`;

  fetch(url, { method: message.type === "fetchTask" ? "GET" : "POST", cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Bridge returned HTTP ${response.status}`);
      }
      const body = await response.json();
      sendResponse({ ok: true, body });
    })
    .catch((error) => sendResponse({ ok: false, error: String(error) }));

  return true;
});
