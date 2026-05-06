import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import { type AgentToolUpdateCallback, type ExtensionContext, type ToolDefinition, createBashTool } from "@mariozechner/pi-coding-agent";

import type { SandboxState } from "../data/SandboxState";
import { createSandboxedBashOps, findUnsandboxedCompoundMatches, isUnsandboxedCommand } from "../sandbox-ops";

type BashParams = {
  command: string;
  timeout?: number;
  bypassSandbox?: boolean;
};

/**
 * If `command` is a compound command whose individual subcommand components would
 * have matched one of the pre-allowed unsandboxed patterns, append a warning to the
 * tool result content so the agent learns that pipes/redirects/compound operators
 * break the pre-allowed match and that it should split the command instead.
 */
function appendCompoundWarning<T>(result: AgentToolResult<T>, command: string, unsandboxedCommands: string[]): AgentToolResult<T> {
  const matches = findUnsandboxedCompoundMatches(command, unsandboxedCommands);
  if (matches.length === 0) return result;

  const lines = matches.map(({ subcommand, pattern }) => `  - '${subcommand}' would match pre-allowed pattern '${pattern}'`);
  const warning =
    `\n[pi-sandbox warning] This compound command was run in the sandbox, but one or more of its\n` +
    `components would have matched a pre-allowed (unsandboxed) pattern if run on their own:\n` +
    `${lines.join("\n")}\n` +
    `Pipes, redirects and other shell operators break the pre-allowed match. If you need the\n` +
    `pre-allowed behaviour, run the matching subcommand on its own without shell operators.\n`;

  return {
    ...result,
    content: [...result.content, { type: "text", text: warning }],
  };
}

export function createSandboxedBashTool(cwd: string, state: SandboxState): ToolDefinition {
  const unsafeOriginalBash = createBashTool(cwd);
  const sandboxedBash = createBashTool(cwd, {
    operations: createSandboxedBashOps(state),
  });
  return {
    ...unsafeOriginalBash,
    description: `${unsafeOriginalBash.description} Runs the command in an OS sandbox by default. Set bypassSandbox: true if needed.`,
    parameters: {
      ...unsafeOriginalBash.parameters,
      properties: {
        ...unsafeOriginalBash.parameters.properties,
        bypassSandbox: { type: "boolean" as const, description: "Request approval to run outside the sandbox. Shows a dialog to the user." },
      },
    },
    async execute(
      id: string,
      params: BashParams,
      signal: AbortSignal | undefined,
      onUpdate: AgentToolUpdateCallback | undefined,
      ctx: ExtensionContext,
    ) {
      const unsandboxedCommands = state.config.unsandboxedCommands ?? [];

      // Check if command is in auto-approved unsandboxed list
      const isAutoApproved = isUnsandboxedCommand(params.command, unsandboxedCommands);

      // If sandbox not enabled or command is auto-approved → run directly
      if (!state.enabled || isAutoApproved) {
        return unsafeOriginalBash.execute(id, params, signal, onUpdate);
      }

      // Default: execute in sandbox
      if (!params.bypassSandbox) {
        const result = await sandboxedBash.execute(id, params, signal, onUpdate);
        return appendCompoundWarning(result, params.command, unsandboxedCommands);
      }

      // Unsandboxed run
      if (!ctx.hasUI) {
        throw new Error("Cannot run unsandboxed command: no UI available for approval");
      }

      const approved = await state.approvalQueue.requestApproval(
        () => ctx.ui.confirm("Unsandboxed Command", `Allow running without sandbox?\n\n${params.command}`, { signal }),
        signal,
      );

      if (signal?.aborted) {
        throw new Error("aborted");
      }

      if (!approved) {
        throw new Error("User denied permission to run command without sandbox");
      }

      return unsafeOriginalBash.execute(id, params, signal, onUpdate);
    },
  };
}
