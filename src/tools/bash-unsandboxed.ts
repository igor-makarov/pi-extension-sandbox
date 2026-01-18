import { type AgentToolUpdateCallback, type ExtensionContext, type Theme, createBashTool } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

import { isUnsandboxedCommand } from "../sandbox-ops.js";
import type { SandboxState } from "./bash-sandboxed.js";

type BashParams = { command: string; timeout?: number };

export function createUnsandboxedBashTool(cwd: string, state: SandboxState) {
  const localBash = createBashTool(cwd);

  return {
    ...localBash,
    name: "bash_unsandboxed_with_permission",
    label: "bash (unsandboxed)",
    description:
      "Run a bash command WITHOUT sandbox restrictions. Use this when a command fails due to sandbox restrictions and you need to bypass them. This command asks the user for approval.",
    renderCall: (args: Record<string, unknown> | undefined, theme: Theme) => {
      const command = args?.command || "...";
      return new Text(theme.fg("toolTitle", theme.bold(`[unsandboxed] $ ${command}`)), 0, 0);
    },
    async execute(id: string, params: BashParams, onUpdate: AgentToolUpdateCallback | undefined, ctx: ExtensionContext, signal?: AbortSignal) {
      const command = params.command;

      // Auto-approve if command is in unsandboxedCommands
      if (isUnsandboxedCommand(command, state.config.unsandboxedCommands ?? [])) {
        return localBash.execute(id, params, signal, onUpdate);
      }

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

      return localBash.execute(id, params, signal, onUpdate);
    },
  };
}
