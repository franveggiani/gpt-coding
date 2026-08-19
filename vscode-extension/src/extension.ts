import * as vscode from "vscode";
import { createBridgeSession } from "./bridge";
import {
  createAndSwitchBranch,
  ensureBranchPushed,
  findEndCommitSince,
  getCurrentBranch,
  getGitRoot,
  getOriginUrl,
  getRemoteHeadSha,
  isWorkingTreeClean,
  listBranches,
  parseGitHubRepository,
  pullFastForward,
  switchToBranch
} from "./git";
import { buildDelegationPrompt } from "./prompt";
import { askForPrompt } from "./promptPanel";

interface PendingTask {
  repository: string;
  branch: string;
  gitRoot: string;
  initialSha: string;
  startedAt: number;
  endCommitSha?: string;
  endCommitSubject?: string;
}

const PENDING_TASK_KEY = "gptCoding.pendingTask";
let monitorTimer: NodeJS.Timeout | undefined;
let monitoring = false;

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("gptCoding.delegateTask", () => delegateTask(context)),
    vscode.commands.registerCommand("gptCoding.pullCompletedTask", () => pullCompletedTask(context)),
    vscode.commands.registerCommand("gptCoding.cancelMonitoring", () => cancelMonitoring(context))
  );

  const pending = context.workspaceState.get<PendingTask>(PENDING_TASK_KEY);
  if (pending) {
    startMonitoring(context, pending);
  }
}

export function deactivate(): void {
  if (monitorTimer) {
    clearTimeout(monitorTimer);
  }
}

async function delegateTask(context: vscode.ExtensionContext): Promise<void> {
  try {
    const existingTask = context.workspaceState.get<PendingTask>(PENDING_TASK_KEY);
    if (existingTask) {
      void vscode.window.showWarningMessage(
        `A GPT Coding task is already pending for ${existingTask.branch}. Pull it or cancel monitoring before starting another task.`
      );
      return;
    }

    const folder = await chooseWorkspaceFolder();
    if (!folder) {
      return;
    }

    const gitRoot = await getGitRoot(folder.uri.fsPath);
    if (!(await isWorkingTreeClean(gitRoot))) {
      void vscode.window.showErrorMessage(
        "GPT Coding requires a clean working tree before switching/delegating branches. Commit or stash your local changes first."
      );
      return;
    }

    const originUrl = await getOriginUrl(gitRoot);
    const repository = parseGitHubRepository(originUrl);
    const branch = await chooseBranch(gitRoot);
    if (!branch) {
      return;
    }

    await ensureBranchPushed(gitRoot, branch);
    const initialSha = await getRemoteHeadSha(gitRoot, branch);
    const userPrompt = await askForPrompt(repository, branch);
    if (!userPrompt) {
      return;
    }

    const fullPrompt = buildDelegationPrompt({ repository, branch, userPrompt });
    const bridge = await createBridgeSession(fullPrompt);
    const pending: PendingTask = {
      repository,
      branch,
      gitRoot,
      initialSha,
      startedAt: Date.now()
    };

    await context.workspaceState.update(PENDING_TASK_KEY, pending);
    startMonitoring(context, pending);

    const chatUrl = vscode.Uri.parse(`https://chatgpt.com/#gpt-coding=${bridge.fragment}`);
    const opened = await vscode.env.openExternal(chatUrl);
    if (!opened) {
      bridge.close();
      throw new Error("VS Code could not open ChatGPT in the default browser.");
    }

    void vscode.window.showInformationMessage(
      `GPT Coding is monitoring origin/${branch}. Review the inserted prompt in ChatGPT and press Send manually.`
    );
  } catch (error) {
    void vscode.window.showErrorMessage(errorMessage(error));
  }
}

async function chooseWorkspaceFolder(): Promise<vscode.WorkspaceFolder | undefined> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    void vscode.window.showErrorMessage("Open a Git repository folder first.");
    return undefined;
  }

  if (folders.length === 1) {
    return folders[0];
  }

  return vscode.window.showWorkspaceFolderPick({ placeHolder: "Select the Git project to delegate" });
}

async function chooseBranch(gitRoot: string): Promise<string | undefined> {
  const current = await getCurrentBranch(gitRoot);
  const branches = await listBranches(gitRoot);
  const items: vscode.QuickPickItem[] = [
    { label: "$(add) Create new branch", description: "Create locally, switch, and push to origin" },
    ...branches.map((branch) => ({
      label: branch,
      description: branch === current ? "Current branch" : undefined
    }))
  ];

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: "Choose the branch ChatGPT should work on"
  });

  if (!selected) {
    return undefined;
  }

  if (selected.label.startsWith("$(add)")) {
    const branch = await vscode.window.showInputBox({
      prompt: "New branch name",
      placeHolder: "feature/my-change",
      validateInput: (value) => {
        if (!value.trim()) {
          return "Branch name is required.";
        }
        if (/\s/.test(value)) {
          return "Git branch names cannot contain whitespace.";
        }
        return undefined;
      }
    });

    if (!branch) {
      return undefined;
    }

    await createAndSwitchBranch(gitRoot, branch.trim());
    return branch.trim();
  }

  await switchToBranch(gitRoot, selected.label);
  return selected.label;
}

function startMonitoring(context: vscode.ExtensionContext, task: PendingTask): void {
  if (monitorTimer) {
    clearTimeout(monitorTimer);
    monitorTimer = undefined;
  }
  monitoring = true;

  const poll = async () => {
    try {
      const endCommit = await findEndCommitSince(task.gitRoot, task.branch, task.initialSha);
      if (endCommit) {
        monitoring = false;
        task.endCommitSha = endCommit.sha;
        task.endCommitSubject = endCommit.subject;
        await context.workspaceState.update(PENDING_TASK_KEY, task);
        await tryAutomaticPull(context, task);
        return;
      }
    } catch (error) {
      monitoring = false;
      void vscode.window.showErrorMessage(`GPT Coding monitor stopped: ${errorMessage(error)}`);
      return;
    }

    const seconds = vscode.workspace
      .getConfiguration("gptCoding")
      .get<number>("pollIntervalSeconds", 10);
    monitorTimer = setTimeout(poll, Math.max(5, seconds) * 1000);
  };

  void poll();
}

async function tryAutomaticPull(context: vscode.ExtensionContext, task: PendingTask): Promise<void> {
  const currentBranch = await getCurrentBranch(task.gitRoot);
  const clean = await isWorkingTreeClean(task.gitRoot);

  if (currentBranch !== task.branch || !clean) {
    const reason = currentBranch !== task.branch
      ? `current branch is '${currentBranch}' instead of '${task.branch}'`
      : "the working tree contains local changes";

    const action = await vscode.window.showWarningMessage(
      `ChatGPT task completed (${task.endCommitSubject}), but GPT Coding did not pull because ${reason}.`,
      "Pull completed task"
    );
    if (action === "Pull completed task") {
      await pullCompletedTask(context);
    }
    return;
  }

  await pullFastForward(task.gitRoot, task.branch);
  await context.workspaceState.update(PENDING_TASK_KEY, undefined);
  void vscode.window.showInformationMessage(
    `GPT Coding completed and pulled ${task.branch}: ${task.endCommitSubject}`
  );
}

async function pullCompletedTask(context: vscode.ExtensionContext): Promise<void> {
  const task = context.workspaceState.get<PendingTask>(PENDING_TASK_KEY);
  if (!task?.endCommitSha) {
    void vscode.window.showInformationMessage("There is no completed GPT Coding task waiting to be pulled.");
    return;
  }

  try {
    if (!(await isWorkingTreeClean(task.gitRoot))) {
      void vscode.window.showErrorMessage("Commit or stash local changes before pulling the completed task.");
      return;
    }

    const current = await getCurrentBranch(task.gitRoot);
    if (current !== task.branch) {
      await switchToBranch(task.gitRoot, task.branch);
    }

    await pullFastForward(task.gitRoot, task.branch);
    await context.workspaceState.update(PENDING_TASK_KEY, undefined);
    void vscode.window.showInformationMessage(`Pulled completed GPT Coding task on ${task.branch}.`);
  } catch (error) {
    void vscode.window.showErrorMessage(errorMessage(error));
  }
}

async function cancelMonitoring(context: vscode.ExtensionContext): Promise<void> {
  if (monitorTimer) {
    clearTimeout(monitorTimer);
    monitorTimer = undefined;
  }
  monitoring = false;
  await context.workspaceState.update(PENDING_TASK_KEY, undefined);
  void vscode.window.showInformationMessage("GPT Coding monitoring cancelled.");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
