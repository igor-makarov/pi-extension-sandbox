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
    description: `${unsafeOriginalWrite.description} Runs in sandbox by default.`,
    parameters: {
      ...unsafeOriginalWrite.parameters,
      properties: {
        ...unsafeOriginalWrite.parameters.properties,
        unsandboxed: { type: "boolean" as const, description: "Bypass sandbox restrictions (UI will ask for approval)" },
      },
    },
    async execute(id: string, params: WriteParams, onUpdate: AgentToolUpdateCallback | undefined, ctx: ExtensionContext, signal?: AbortSignal) {
      // If sandbox not enabled → run directly
      if (!state.enabled) {
        onUpdate?.({ content: [{ type: "text", text: "[unsandboxed]" }], details: {} });
        const result = await unsafeOriginalWrite.execute(id, params, signal, onUpdate);
        result.content = [...result.content, { type: "text", text: "[unsandboxed]" }];
        return result;
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

      onUpdate?.({ content: [{ type: "text", text: "[unsandboxed]" }], details: {} });
      const result = await unsafeOriginalWrite.execute(id, params, signal, onUpdate);
      result.content = [...result.content, { type: "text", text: "[unsandboxed]" }];
      return result;
    },
  };
}
