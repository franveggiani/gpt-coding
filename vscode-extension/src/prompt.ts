export interface DelegationPromptInput {
  repository: string;
  branch: string;
  userPrompt: string;
}

export function buildDelegationPrompt(input: DelegationPromptInput): string {
  return `Work on the GitHub repository: ${input.repository}

Target branch: ${input.branch}

Work exclusively on that branch. If the branch does not exist, create it from the repository's default branch before changing files. Do not make task changes on any other branch.

Execute the following task:

--- USER TASK ---
${input.userPrompt.trim()}
--- END USER TASK ---

MANDATORY COMPLETION PROTOCOL:
1. Make the requested changes and validate them as appropriate for the project.
2. You may create intermediate commits while working.
3. Push all task commits to the target branch: ${input.branch}.
4. Only when the task is fully complete and the branch contains all final changes, ensure the LAST commit for this task has a commit subject that starts EXACTLY with:
   END - 
5. The text after "END - " must be a short summary of what was completed. Example: "END - add view synchronization support".
6. Do not create the END commit before the work is complete. If you cannot finish the task or cannot push the completed work, do NOT create an END commit.
7. Do not create any additional task commits after the END commit.

The local VS Code extension uses the remote Git history, not the ChatGPT page, to detect completion. Therefore the END - commit convention is required.`;
}
