import { type AgentToolUpdateCallback, type ExtensionContext, type Theme, createBashTool } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

import { createSandboxedBashOps, isUnsandboxedCommand } from "../sandbox-ops.js";
import type { SandboxConfig } from "../types.js";

export interface SandboxState {
  enabled: boolean;
  initialized: boolean;
  config: SandboxConfig;
}

type BashParams = {
  command: string;
  timeout?: number;
  unsandboxed?: boolean;
};

export function createSandboxedBashTool(cwd: string, state: SandboxState) {
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
    renderCall: (args: Record<string, unknown> | undefined, theme: Theme) => {
      const command = (args?.command as string) || "...";
      const unsandboxed = args?.unsandboxed as boolean;

      const willRunUnsandboxed =
        unsandboxed || !state.enabled || !state.initialized || isUnsandboxedCommand(command, state.config.unsandboxedCommands ?? []);

      if (willRunUnsandboxed) {
        return new Text(theme.fg("toolTitle", theme.bold(`[unsandboxed] $ ${command}`)), 0, 0);
      }
      return new Text(theme.fg("toolTitle", theme.bold(`$ ${command}`)), 0, 0);
    },
    async execute(id: string, params: BashParams, onUpdate: AgentToolUpdateCallback | undefined, ctx: ExtensionContext, signal?: AbortSignal) {
      const { command, unsandboxed } = params;

      // Check if command is in auto-approved unsandboxed list
      const isAutoApproved = isUnsandboxedCommand(command, state.config.unsandboxedCommands ?? []);

      // If sandbox not enabled/initialized, or command is auto-approved → run directly
      if (!state.enabled || !state.initialized || isAutoApproved) {
        return unsafeOriginalBash.execute(id, params, signal, onUpdate);
      }

      // Default: execute in sandbox
      if (!unsandboxed) {
        return sandboxedBash.execute(id, params, signal, onUpdate);
      }

      // Unsandboxed run
      if (!ctx.hasUI) {
        return {
          type: "tool_result" as const,
          content: [{ type: "text" as const, text: "Cannot run unsandboxed command: no UI available for approval" }],
          isError: true,
          details: undefined,
        };
      }

      const approved = await ctx.ui.confirm(
        "Unsandboxed Command",
        `Allow running without sandbox?\n\n${command.slice(0, 500)}${command.length > 500 ? "..." : ""}`,
      );

      if (!approved) {
        return {
          type: "tool_result" as const,
          content: [{ type: "text" as const, text: "User denied permission to run command without sandbox" }],
          isError: true,
          details: undefined,
        };
      }

      return unsafeOriginalBash.execute(id, params, signal, onUpdate);
    },
  };
}
