(() => {
  "use strict";

  if (window.top !== window) {
    return;
  }

  const parsed = parseBridgeFragment(window.location.hash);
  if (!parsed) {
    return;
  }

  run(parsed).catch((error) => {
    showBanner(`GPT Coding could not insert the prompt: ${String(error)}`, true);
  });

  async function run(bridge) {
    const response = await chrome.runtime.sendMessage({ type: "fetchTask", ...bridge });
    if (!response?.ok || typeof response.body?.prompt !== "string") {
      throw new Error(response?.error || "Could not read the local bridge task.");
    }

    const composer = await waitForComposer(30000);
    insertPrompt(composer, response.body.prompt);
    showBanner("GPT Coding inserted the task. Review it and press Send manually.", false);

    await chrome.runtime.sendMessage({ type: "ackTask", ...bridge });
    history.replaceState(null, "", `${location.pathname}${location.search}`);
  }

  function parseBridgeFragment(hash) {
    const prefix = "#gpt-coding=";
    if (!hash.startsWith(prefix)) {
      return null;
    }

    const parts = hash.slice(prefix.length).split(".");
    if (parts.length !== 3) {
      return null;
    }

    const port = Number(parts[0]);
    const sessionId = parts[1];
    const token = parts[2];
    if (!Number.isInteger(port) || !sessionId || !token) {
      return null;
    }

    return { port, sessionId, token };
  }

  async function waitForComposer(timeoutMs) {
    const selectors = [
      "#prompt-textarea",
      "textarea[data-testid='prompt-textarea']",
      "div[data-testid='prompt-textarea'][contenteditable='true']",
      "textarea[placeholder]",
      "div[contenteditable='true'][role='textbox']"
    ];

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element instanceof HTMLElement && isVisible(element)) {
          return element;
        }
      }
      await sleep(250);
    }

    throw new Error("ChatGPT prompt composer was not found within 30 seconds.");
  }

  function insertPrompt(element, text) {
    element.focus();

    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
      const prototype = element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      if (!setter) {
        throw new Error("Could not access the prompt input setter.");
      }
      setter.call(element, text);
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    if (element.isContentEditable) {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(element);
      selection?.removeAllRanges();
      selection?.addRange(range);

      const inserted = document.execCommand("insertText", false, text);
      if (!inserted) {
        element.textContent = text;
        element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
      }
      return;
    }

    throw new Error("Unsupported ChatGPT prompt composer element.");
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function showBanner(message, isError) {
    const existing = document.getElementById("gpt-coding-bridge-banner");
    existing?.remove();

    const banner = document.createElement("div");
    banner.id = "gpt-coding-bridge-banner";
    banner.textContent = message;
    banner.style.position = "fixed";
    banner.style.top = "12px";
    banner.style.left = "50%";
    banner.style.transform = "translateX(-50%)";
    banner.style.zIndex = "2147483647";
    banner.style.padding = "10px 14px";
    banner.style.borderRadius = "8px";
    banner.style.fontFamily = "system-ui, sans-serif";
    banner.style.fontSize = "13px";
    banner.style.background = isError ? "#7f1d1d" : "#1f2937";
    banner.style.color = "#fff";
    banner.style.boxShadow = "0 4px 18px rgba(0,0,0,.25)";
    document.body.appendChild(banner);

    setTimeout(() => banner.remove(), isError ? 10000 : 6000);
  }
})();
