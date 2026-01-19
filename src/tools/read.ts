import { type AgentToolUpdateCallback, type ExtensionContext, type ToolDefinition, createReadTool } from "@mariozechner/pi-coding-agent";

import type { SandboxState } from "../data/SandboxState";
import { isReadAllowed } from "../file-ops";

type ReadParams = {
  path: string;
  offset?: number;
  limit?: number;
  unsandboxed?: boolean;
};

export function createSandboxedReadTool(cwd: string, state: SandboxState): ToolDefinition {
  const unsafeOriginalRead = createReadTool(cwd);

  return {
    ...unsafeOriginalRead,
    description: `${unsafeOriginalRead.description} Runs in sandbox by default.`,
    parameters: {
      ...unsafeOriginalRead.parameters,
      properties: {
        ...unsafeOriginalRead.parameters.properties,
        unsandboxed: { type: "boolean" as const, description: "Bypass sandbox restrictions (UI will ask for approval)" },
      },
    },
    async execute(id: string, params: ReadParams, onUpdate: AgentToolUpdateCallback | undefined, ctx: ExtensionContext, signal?: AbortSignal) {
      // If sandbox not enabled → run directly
      if (!state.enabled) {
        onUpdate?.({ content: [{ type: "text", text: "[unsandboxed]" }], details: {} });
        const result = await unsafeOriginalRead.execute(id, params, signal, onUpdate);
        result.content = [...result.content, { type: "text", text: "[unsandboxed]" }];
        return result;
      }

      // Default: check if read is allowed
      if (!params.unsandboxed) {
        if (!isReadAllowed(params.path, cwd, state.config)) {
          throw new Error(`Sandbox: read denied for "${params.path}"`);
        }
        return unsafeOriginalRead.execute(id, params, signal, onUpdate);
      }

      // Unsandboxed run
      if (!ctx.hasUI) {
        throw new Error("Cannot run unsandboxed read: no UI available for approval");
      }

      const approved = await ctx.ui.confirm("Unsandboxed Read", `Allow reading without sandbox?\n\n${params.path}`);

      if (!approved) {
        throw new Error("User denied permission to read without sandbox");
      }

      onUpdate?.({ content: [{ type: "text", text: "[unsandboxed]" }], details: {} });
      const result = await unsafeOriginalRead.execute(id, params, signal, onUpdate);
      result.content = [...result.content, { type: "text", text: "[unsandboxed]" }];
      return result;
    },
  };
}
