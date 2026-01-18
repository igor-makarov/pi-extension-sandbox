import { type AgentToolUpdateCallback, type ExtensionContext, type Theme, createBashTool } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

import { createSandboxedBashOps, isUnsandboxedCommand } from "../sandbox-ops.js";
import type { SandboxConfig } from "../types.js";

export interface SandboxState {
  enabled: boolean;
  initialized: boolean;
  config: SandboxConfig;
}

type BashParams = { command: string; timeout?: number };

export function createSandboxedBashTool(cwd: string, state: SandboxState) {
  const localBash = createBashTool(cwd);

  return {
    ...localBash,
    label: "bash (sandboxed)",
    renderCall: (args: Record<string, unknown> | undefined, theme: Theme) => {
      const command = (args?.command as string) || "...";
      if (state.enabled && state.initialized && isUnsandboxedCommand(command, state.config.unsandboxedCommands ?? [])) {
        return new Text(theme.fg("toolTitle", theme.bold(`[unsandboxed] $ ${command}`)), 0, 0);
      }
      return new Text(theme.fg("toolTitle", theme.bold(`$ ${command}`)), 0, 0);
    },
    async execute(id: string, params: BashParams, onUpdate: AgentToolUpdateCallback | undefined, _ctx: ExtensionContext, signal?: AbortSignal) {
      if (!state.enabled || !state.initialized) {
        return localBash.execute(id, params, signal, onUpdate);
      }

      const command = params.command;
      if (isUnsandboxedCommand(command, state.config.unsandboxedCommands ?? [])) {
        return localBash.execute(id, params, signal, onUpdate);
      }

      const sandboxedBash = createBashTool(cwd, {
        operations: createSandboxedBashOps(),
      });
      return sandboxedBash.execute(id, params, signal, onUpdate);
    },
  };
}
