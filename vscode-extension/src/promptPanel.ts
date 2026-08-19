import * as vscode from "vscode";

export async function askForPrompt(repository: string, branch: string): Promise<string | undefined> {
  const panel = vscode.window.createWebviewPanel(
    "gptCodingPrompt",
    "GPT Coding: Delegate Task",
    vscode.ViewColumn.Active,
    { enableScripts: true }
  );

  panel.webview.html = getHtml(repository, branch);

  return new Promise<string | undefined>((resolve) => {
    let settled = false;

    const finish = (value: string | undefined) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
      panel.dispose();
    };

    panel.webview.onDidReceiveMessage((message) => {
      if (message?.type === "submit" && typeof message.prompt === "string") {
        const prompt = message.prompt.trim();
        if (!prompt) {
          void vscode.window.showWarningMessage("The task prompt cannot be empty.");
          return;
        }
        finish(prompt);
      }
    });

    panel.onDidDispose(() => {
      if (!settled) {
        settled = true;
        resolve(undefined);
      }
    });
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getHtml(repository: string, branch: string): string {
  const repo = escapeHtml(repository);
  const branchName = escapeHtml(branch);

  return `<!doctype html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { font-family: var(--vscode-font-family); padding: 24px; color: var(--vscode-foreground); }
    .meta { margin-bottom: 18px; color: var(--vscode-descriptionForeground); }
    .meta strong { color: var(--vscode-foreground); }
    textarea {
      width: 100%; min-height: 280px; box-sizing: border-box; resize: vertical;
      background: var(--vscode-input-background); color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, transparent); padding: 12px;
      font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size);
    }
    button {
      margin-top: 14px; padding: 8px 14px; border: 0; cursor: pointer;
      background: var(--vscode-button-background); color: var(--vscode-button-foreground);
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    .note { margin-top: 14px; color: var(--vscode-descriptionForeground); font-size: 12px; }
  </style>
</head>
<body>
  <h2>Delegate task to ChatGPT Web</h2>
  <div class="meta"><strong>Repository:</strong> ${repo}<br/><strong>Branch:</strong> ${branchName}</div>
  <textarea id="prompt" autofocus placeholder="Describe the change you want ChatGPT to make..."></textarea>
  <br/>
  <button id="open">Open in ChatGPT</button>
  <div class="note">The browser extension only inserts the prepared prompt. You review it and press Send manually.</div>
  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById('open').addEventListener('click', () => {
      vscode.postMessage({ type: 'submit', prompt: document.getElementById('prompt').value });
    });
  </script>
</body>
</html>`;
}
