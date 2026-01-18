import { type AgentToolUpdateCallback, type ExtensionContext, createBashTool } from "@mariozechner/pi-coding-agent";

import { createSandboxedBashOps, shouldBypassSandbox } from "@/src/sandbox-ops.js";
import type { SandboxConfig } from "@/src/types.js";

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
    async execute(id: string, params: BashParams, onUpdate: AgentToolUpdateCallback | undefined, _ctx: ExtensionContext, signal?: AbortSignal) {
      if (!state.enabled || !state.initialized) {
        return localBash.execute(id, params, signal, onUpdate);
      }

      const command = params.command;
      if (shouldBypassSandbox(command, state.config.bypassedCommands ?? [])) {
        return localBash.execute(id, params, signal, onUpdate);
      }

      const sandboxedBash = createBashTool(cwd, {
        operations: createSandboxedBashOps(),
      });
      return sandboxedBash.execute(id, params, signal, onUpdate);
    },
  };
}
