import { type AgentToolUpdateCallback, type ExtensionContext, type ToolDefinition, createWriteTool } from "@mariozechner/pi-coding-agent";

import type { SandboxState } from "../data/SandboxState";
import { isWriteAllowed } from "../file-ops";

type WriteParams = {
  path: string;
  content: string;
  unsandboxed?: boolean;
};

export function createSandboxedWriteTool(cwd: string, state: SandboxState): ToolDefinition {
  const unsafeOriginalWrite = createWriteTool(cwd);

  return {
    ...unsafeOriginalWrite,
    description: `${unsafeOriginalWrite.description} Writes in sandbox by default. Allows escalation via a UI prompt.`,
    parameters: {
      ...unsafeOriginalWrite.parameters,
      properties: {
        ...unsafeOriginalWrite.parameters.properties,
        unsandboxed: { type: "boolean" as const, description: "Show UI to user to bypass sandbox restrictions" },
      },
    },
    async execute(id: string, params: WriteParams, onUpdate: AgentToolUpdateCallback | undefined, ctx: ExtensionContext, signal?: AbortSignal) {
      // If sandbox not enabled → run directly
      if (!state.enabled) {
        return unsafeOriginalWrite.execute(id, params, signal, onUpdate);
      }

      // Default: check if write is allowed
      if (!params.unsandboxed) {
        if (!isWriteAllowed(params.path, cwd, state.config)) {
          throw new Error(`Sandbox: write denied for "${params.path}"`);
        }
        return unsafeOriginalWrite.execute(id, params, signal, onUpdate);
      }

      // Unsandboxed run
      if (!ctx.hasUI) {
        throw new Error("Cannot run unsandboxed write: no UI available for approval");
      }

      const approved = await ctx.ui.confirm("Unsandboxed Write", `Allow writing without sandbox?\n\n${params.path}`);

      if (!approved) {
        throw new Error("User denied permission to write without sandbox");
      }

      return unsafeOriginalWrite.execute(id, params, signal, onUpdate);
    },
  };
}
