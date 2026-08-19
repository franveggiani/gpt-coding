import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface EndCommit {
  sha: string;
  subject: string;
}

async function runGit(cwd: string, args: string[], allowFailure = false): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024
    });
    return stdout.trim();
  } catch (error) {
    if (allowFailure) {
      return "";
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`git ${args.join(" ")} failed: ${message}`);
  }
}

export async function getGitRoot(cwd: string): Promise<string> {
  return runGit(cwd, ["rev-parse", "--show-toplevel"]);
}

export async function getCurrentBranch(cwd: string): Promise<string> {
  return runGit(cwd, ["branch", "--show-current"]);
}

export async function isWorkingTreeClean(cwd: string): Promise<boolean> {
  return (await runGit(cwd, ["status", "--porcelain"])) === "";
}

export async function getOriginUrl(cwd: string): Promise<string> {
  return runGit(cwd, ["remote", "get-url", "origin"]);
}

export function parseGitHubRepository(remoteUrl: string): string {
  const trimmed = remoteUrl.trim().replace(/\.git$/, "");

  const sshMatch = trimmed.match(/^git@github\.com:([^/]+\/[^/]+)$/i);
  if (sshMatch) {
    return sshMatch[1];
  }

  const sshUrlMatch = trimmed.match(/^ssh:\/\/git@github\.com\/([^/]+\/[^/]+)$/i);
  if (sshUrlMatch) {
    return sshUrlMatch[1];
  }

  const httpsMatch = trimmed.match(/^https?:\/\/github\.com\/([^/]+\/[^/]+)$/i);
  if (httpsMatch) {
    return httpsMatch[1];
  }

  throw new Error("The origin remote is not a supported github.com URL.");
}

export async function listBranches(cwd: string): Promise<string[]> {
  const output = await runGit(cwd, [
    "for-each-ref",
    "--format=%(refname:short)",
    "refs/heads",
    "refs/remotes/origin"
  ]);

  const names = new Set<string>();
  for (const raw of output.split(/\r?\n/).map((v) => v.trim()).filter(Boolean)) {
    if (raw === "origin/HEAD") {
      continue;
    }
    names.add(raw.startsWith("origin/") ? raw.slice("origin/".length) : raw);
  }

  return [...names].sort((a, b) => a.localeCompare(b));
}

export async function branchExistsLocally(cwd: string, branch: string): Promise<boolean> {
  const output = await runGit(cwd, ["show-ref", "--verify", `refs/heads/${branch}`], true);
  return output !== "";
}

export async function branchExistsRemotely(cwd: string, branch: string): Promise<boolean> {
  const output = await runGit(cwd, ["ls-remote", "--heads", "origin", `refs/heads/${branch}`], true);
  return output !== "";
}

export async function switchToBranch(cwd: string, branch: string): Promise<void> {
  const current = await getCurrentBranch(cwd);
  if (current === branch) {
    return;
  }

  if (await branchExistsLocally(cwd, branch)) {
    await runGit(cwd, ["switch", branch]);
    return;
  }

  if (await branchExistsRemotely(cwd, branch)) {
    await runGit(cwd, ["fetch", "origin", branch]);
    await runGit(cwd, ["switch", "--track", "-c", branch, `origin/${branch}`]);
    return;
  }

  throw new Error(`Branch '${branch}' does not exist.`);
}

export async function createAndSwitchBranch(cwd: string, branch: string): Promise<void> {
  if (await branchExistsLocally(cwd, branch) || await branchExistsRemotely(cwd, branch)) {
    throw new Error(`Branch '${branch}' already exists.`);
  }
  await runGit(cwd, ["switch", "-c", branch]);
}

export async function ensureBranchPushed(cwd: string, branch: string): Promise<void> {
  // Always use a normal (non-force) push. This both creates the remote branch when
  // needed and guarantees that local commits are visible to the remote worker.
  // If the remote has diverged, Git rejects the push and delegation stops safely.
  await runGit(cwd, ["push", "-u", "origin", branch]);
}

export async function getRemoteHeadSha(cwd: string, branch: string): Promise<string> {
  const output = await runGit(cwd, ["ls-remote", "--heads", "origin", `refs/heads/${branch}`]);
  const first = output.split(/\s+/)[0];
  if (!first) {
    throw new Error(`Could not resolve remote branch origin/${branch}.`);
  }
  return first;
}

export async function fetchBranch(cwd: string, branch: string): Promise<void> {
  await runGit(cwd, ["fetch", "--quiet", "origin", branch]);
}

export async function findEndCommitSince(
  cwd: string,
  branch: string,
  initialSha: string
): Promise<EndCommit | undefined> {
  await fetchBranch(cwd, branch);

  const remoteHead = await runGit(cwd, ["rev-parse", `origin/${branch}`], true);
  if (!remoteHead || remoteHead === initialSha) {
    return undefined;
  }

  // Refuse to reason about completion if the monitored branch was rewritten.
  const mergeBase = await runGit(cwd, ["merge-base", initialSha, `origin/${branch}`], true);
  if (mergeBase !== initialSha) {
    throw new Error("The remote branch history diverged or was force-pushed while monitoring.");
  }

  // Completion is deliberately defined by the current remote HEAD. We do not
  // accept an older END marker followed by later commits because the protocol
  // requires END - ... to be the last task commit.
  const headLine = await runGit(cwd, ["show", "-s", "--format=%H%x00%s", `origin/${branch}`]);
  const separator = headLine.indexOf("\0");
  if (separator < 0) {
    return undefined;
  }

  const sha = headLine.slice(0, separator);
  const subject = headLine.slice(separator + 1);
  if (!subject.startsWith("END - ")) {
    return undefined;
  }

  return { sha, subject };
}

export async function pullFastForward(cwd: string, branch: string): Promise<void> {
  await runGit(cwd, ["pull", "--ff-only", "origin", branch]);
}
