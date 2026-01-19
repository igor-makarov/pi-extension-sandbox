import { type AgentToolUpdateCallback, type ExtensionContext, type Theme, type ToolDefinition, createBashTool } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

import type { SandboxState } from "../data/SandboxState";
import { createSandboxedBashOps, isUnsandboxedCommand } from "../sandbox-ops";

type BashParams = {
  command: string;
  timeout?: number;
  unsandboxed?: boolean;
};

export function createSandboxedBashTool(cwd: string, state: SandboxState): ToolDefinition {
  const unsafeOriginalBash = createBashTool(cwd);
  const sandboxedBash = createBashTool(cwd, {
    operations: createSandboxedBashOps(),
  });
  return {
    ...unsafeOriginalBash,
    description: `${unsafeOriginalBash.description} Runs the command in an OS sandbox by default.`,
    parameters: {
      ...unsafeOriginalBash.parameters,
      properties: {
        ...unsafeOriginalBash.parameters.properties,
        unsandboxed: { type: "boolean" as const, description: "Bypass sandbox restrictions (UI will ask for approval)" },
      },
    },
    renderCall: (args: unknown, theme: Theme) => {
      const params = args as BashParams;

      const willRunUnsandboxed = params.unsandboxed || !state.enabled || isUnsandboxedCommand(params.command, state.config.unsandboxedCommands ?? []);

      if (willRunUnsandboxed) {
        return new Text(theme.fg("toolTitle", theme.bold(`[unsandboxed] $ ${params.command}`)), 0, 0);
      }
      return new Text(theme.fg("toolTitle", theme.bold(`$ ${params.command}`)), 0, 0);
    },
    async execute(id: string, params: BashParams, onUpdate: AgentToolUpdateCallback | undefined, ctx: ExtensionContext, signal?: AbortSignal) {
      // Check if command is in auto-approved unsandboxed list
      const isAutoApproved = isUnsandboxedCommand(params.command, state.config.unsandboxedCommands ?? []);

      // If sandbox not enabled or command is auto-approved → run directly
      if (!state.enabled || isAutoApproved) {
        return unsafeOriginalBash.execute(id, params, signal, onUpdate);
      }

      // Default: execute in sandbox
      if (!params.unsandboxed) {
        return sandboxedBash.execute(id, params, signal, onUpdate);
      }

      // Unsandboxed run
      if (!ctx.hasUI) {
        throw new Error("Cannot run unsandboxed command: no UI available for approval");
      }

      const approved = await ctx.ui.confirm("Unsandboxed Command", `Allow running without sandbox?\n\n${params.command}`);

      if (!approved) {
        throw new Error("User denied permission to run command without sandbox");
      }

      return unsafeOriginalBash.execute(id, params, signal, onUpdate);
    },
  };
}
