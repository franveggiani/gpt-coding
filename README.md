# GPT Coding

GPT Coding is a small bridge between VS Code, ChatGPT Web, and Git.

It is intentionally designed so that **the user remains in control of ChatGPT Web**:

- the VS Code extension prepares the target Git branch and the task prompt;
- the browser extension inserts that prepared prompt into the ChatGPT composer;
- **the browser extension never presses Send**;
- **the browser extension never reads, scrapes, extracts, or monitors ChatGPT responses/output**;
- completion is detected only from Git by waiting for a new remote HEAD commit whose subject starts with `END - `;
- when that marker appears, the VS Code extension pulls the branch with `git pull --ff-only` when it is safe to do so.

## Important prerequisite: GitHub write capability in ChatGPT

GPT Coding does **not** grant ChatGPT access to GitHub and does not bypass GitHub/OpenAI permissions.

The ChatGPT session you use must already have a supported tool/integration that can modify and push to the selected GitHub repository. As of August 2026, OpenAI documents the standard GitHub app in ChatGPT as read-only for repository analysis/search; direct repository editing/pushing is documented separately. Therefore, do not assume that a stock ChatGPT + GitHub connection can write to the repository.

Official reference:

- https://help.openai.com/en/articles/11145903-connecting-github-to-chatgpt

If your ChatGPT environment does not have GitHub write capability, GPT Coding can still prepare and insert the prompt, but the automatic Git completion flow cannot complete because no remote commits will be created.

## How it works

```text
VS Code
  |
  | 1. Select/create branch
  | 2. Push branch to origin
  | 3. Write task
  v
Local one-time bridge on 127.0.0.1
  |
  v
Browser extension
  |
  | Inserts prompt only
  v
ChatGPT Web
  |
  | USER REVIEWS + PRESSES SEND MANUALLY
  v
ChatGPT works using the GitHub capability already available to the user
  |
  | commits/pushes to target branch
  | final task commit: END - <summary>
  v
GitHub
  |
  | VS Code polls Git, not ChatGPT
  v
END commit detected
  |
  v
git pull --ff-only
```

The generated prompt contains a mandatory completion protocol. ChatGPT is asked to make the last task commit start exactly with:

```text
END - <short summary>
```

Example:

```text
END - add view synchronization support
```

The marker is deliberately stored in Git history instead of inferred from the ChatGPT UI.

## Repository structure

```text
gpt-coding/
├── install.sh
├── install.ps1
├── browser-extension/
│   ├── manifest.json
│   ├── background.js
│   └── content.js
├── vscode-extension/
│   ├── src/
│   │   ├── bridge.ts
│   │   ├── extension.ts
│   │   ├── git.ts
│   │   ├── prompt.ts
│   │   └── promptPanel.ts
│   ├── package.json
│   └── tsconfig.json
└── README.md
```

# Installation

You need both the VS Code extension and the browser extension. The recommended installation method is to use the installer for your operating system.

## Requirements

- Git installed and available in `PATH`;
- Node.js 20 or newer;
- npm;
- VS Code 1.90+;
- the VS Code CLI command `code` available in `PATH`;
- Chrome or another Chromium browser for the browser extension;
- the Git project you want to delegate must use a `github.com` remote named `origin`.

The installers validate `git`, `node`, `npm`, `code`, the Node.js major version, and the required project files before building.

## 1. Clone this repository

```bash
git clone https://github.com/franveggiani/gpt-coding.git
cd gpt-coding
```

## 2. Automatic installation on Linux/macOS

Make the installer executable and run it from the repository root:

```bash
chmod +x install.sh
./install.sh
```

The script will:

1. validate Git, Node.js, npm, and the VS Code CLI;
2. run `npm install` inside `vscode-extension/`;
3. compile and package the extension as a `.vsix`;
4. install/update the VS Code extension with `code --install-extension ... --force`;
5. validate that `browser-extension/manifest.json` exists;
6. print the exact `browser-extension/` path and the Chrome installation steps at the end.

The final console output includes instructions similar to:

```text
========================================
 MANUAL CHROME SETUP
========================================
1. Open Chrome.
2. Go to: chrome://extensions
3. Enable "Developer mode".
4. Click "Load unpacked".
5. Select this exact folder:

   /absolute/path/to/gpt-coding/browser-extension

6. Confirm that "GPT Coding Bridge" appears enabled.
7. Keep the extension enabled while using GPT Coding.
```

## 3. Automatic installation on Windows

From PowerShell in the repository root:

```powershell
.\install.ps1
```

If your local PowerShell execution policy blocks local scripts, you can run this single invocation without changing the machine-wide policy:

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

The PowerShell installer performs the same validation/build/package/install workflow as `install.sh` and finishes by printing the exact Chrome steps and the absolute `browser-extension` directory to select with **Load unpacked**.

Example final output:

```text
========================================
 MANUAL CHROME SETUP
========================================
1. Open Chrome.
2. Go to: chrome://extensions
3. Enable "Developer mode" in the top-right corner.
4. Click "Load unpacked".
5. Select this exact folder:

   C:\Projects\gpt-coding\browser-extension

6. Confirm that "GPT Coding Bridge" appears enabled.
7. Keep the extension enabled while using GPT Coding.
```

Chrome requires this last browser-extension step to remain manual. The installer does not try to bypass Chrome's extension installation controls.

## 4. Manual VS Code installation

If you do not want to use the installer scripts:

```bash
cd vscode-extension
npm install
npm run compile
npm run package:vsix
```

This creates:

```text
gpt-coding-0.1.0.vsix
```

Install it with:

```bash
code --install-extension gpt-coding-0.1.0.vsix --force
```

Alternatively, in VS Code use:

```text
Extensions -> ... -> Install from VSIX...
```

and select the generated `.vsix` file.

## 5. Manual browser extension installation in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the repository's `browser-extension` directory.
5. Confirm that **GPT Coding Bridge** is enabled.

No browser-extension build step is required.

## Microsoft Edge

The extension is Manifest V3 and can also be loaded manually in Edge:

1. Open `edge://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the repository's `browser-extension` directory.

# Usage

Open the Git project you want ChatGPT to work on in VS Code.

The working tree must be clean before delegation because GPT Coding may need to switch branches.

Open the command palette:

```text
Ctrl+Shift+P
```

Run:

```text
GPT Coding: Delegate Task
```

Then:

1. choose an existing branch or select **Create new branch**;
2. if you create a branch, GPT Coding creates it locally, switches to it, and pushes it to `origin`;
3. write the requested project change in the task editor;
4. click **Open in ChatGPT**;
5. ChatGPT opens in your browser;
6. the browser extension inserts the full generated prompt into the ChatGPT composer;
7. **review the prompt and press Send yourself**;
8. GPT Coding starts checking the selected remote Git branch;
9. when the new remote HEAD commit after the initial branch SHA has a subject beginning with `END - `, the task is considered complete;
10. if the same branch is still checked out and the working tree is clean, GPT Coding runs:

```bash
git pull --ff-only origin <branch>
```

If it is not safe to pull automatically, GPT Coding leaves the local work untouched and offers the command:

```text
GPT Coding: Pull Completed Task
```

## Generated prompt protocol

The task entered by the user is wrapped with repository, branch, and completion instructions similar to:

```text
Work on the GitHub repository: owner/repository

Target branch: feature/example

Work exclusively on that branch. If it does not exist, create it from the default branch.

Execute the following task:

<USER TASK>

MANDATORY COMPLETION PROTOCOL:
- complete and validate the requested work;
- push all task commits to the selected branch;
- only when fully complete, make the LAST task commit start exactly with "END - ";
- do not create an END commit if the task could not be completed/pushed;
- do not add task commits after the END commit.
```

Intermediate commits are allowed:

```text
Implement database mapper
Add mapper tests
Fix PostgreSQL edge case
END - complete database mapping support
```

Only a remote HEAD whose subject starts with `END - ` marks completion. An older `END - ...` commit followed by another commit does not complete the task.

# Safety behavior

GPT Coding deliberately avoids destructive Git behavior:

- it refuses to start branch switching with a dirty working tree;
- it never runs `git reset --hard`;
- it never force-pushes;
- it never auto-stashes local work;
- automatic synchronization uses `git pull --ff-only`;
- if you switch branches or create local modifications while ChatGPT is working, automatic pull is skipped.

If the monitored remote history is rewritten/force-pushed away from the starting SHA, monitoring stops rather than guessing that the task completed.

# ChatGPT Web interaction and compliance design

This project is intentionally limited to a narrow browser action: **insert the prompt prepared by the user into the ChatGPT prompt composer**.

It does not:

- automatically submit prompts;
- click the Send button;
- read ChatGPT messages;
- scrape ChatGPT responses;
- programmatically extract ChatGPT data or output;
- detect completion from page content;
- access or export ChatGPT cookies/session tokens;
- bypass rate limits, safeguards, authentication, subscription limits, or product restrictions.

The user performs the actual ChatGPT submission manually. After that, GPT Coding observes only the user's Git remote.

OpenAI's current Terms of Use prohibit, among other things, automatically/programmatically extracting data or Output and bypassing protective measures. GPT Coding is designed not to do those things. Terms can change, so users should review the current OpenAI terms before use:

- https://openai.com/policies/terms-of-use/
- https://openai.com/policies/usage-policies/

This project does not claim that installing a browser extension can guarantee compliance with every future product rule or jurisdiction-specific term. It intentionally minimizes interaction with ChatGPT Web and keeps the Send action human-controlled.

# Local bridge security

The VS Code extension opens a temporary HTTP server bound only to:

```text
127.0.0.1
```

It uses:

- a random ephemeral port;
- a random session UUID;
- a random one-time token;
- a five-minute expiration;
- no persistent HTTP service.

The prompt itself is not placed in the ChatGPT URL. The URL fragment contains only the local bridge coordinates/token. The browser extension retrieves the prompt locally and acknowledges successful insertion, after which the bridge closes.

# Commands

```text
GPT Coding: Delegate Task
GPT Coding: Pull Completed Task
GPT Coding: Cancel Monitoring
```

# Configuration

`gptCoding.pollIntervalSeconds`

Default:

```text
10 seconds
```

Minimum:

```text
5 seconds
```

The polling is Git polling. It does not poll or scrape ChatGPT.

# Known limitations

- Only `github.com` `origin` remotes are supported in the initial version.
- One pending task per VS Code workspace is supported.
- ChatGPT must already have a repository-writing capability available to the user for the remote workflow to work end to end.
- ChatGPT's DOM can change; if the prompt composer changes significantly, the browser extension's composer selector may need updating.
- Because Send is deliberately manual, GPT Coding cannot know whether the user actually submitted the prompt. Monitoring continues until an `END - ...` commit appears or the user cancels it.

# Development

VS Code extension:

```bash
cd vscode-extension
npm install
npm run watch
```

Press `F5` in VS Code to launch an Extension Development Host.

Browser extension:

- load `browser-extension/` as an unpacked extension;
- after editing `background.js`, `content.js`, or `manifest.json`, reload it from the browser extensions page.

# License

MIT.
