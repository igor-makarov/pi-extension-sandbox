import { type AgentToolUpdateCallback, type ExtensionContext, type ToolDefinition, createEditTool } from "@mariozechner/pi-coding-agent";

import type { SandboxState } from "../data/SandboxState";
import { isWriteAllowed } from "../file-ops";

type EditParams = {
  path: string;
  oldText: string;
  newText: string;
  unsandboxed?: boolean;
};

export function createSandboxedEditTool(cwd: string, state: SandboxState): ToolDefinition {
  const unsafeOriginalEdit = createEditTool(cwd);

  return {
    ...unsafeOriginalEdit,
    description: `${unsafeOriginalEdit.description} Edits in sandbox by default. Allows escalation via a UI prompt.`,
    parameters: {
      ...unsafeOriginalEdit.parameters,
      properties: {
        ...unsafeOriginalEdit.parameters.properties,
        unsandboxed: { type: "boolean" as const, description: "Show UI to user to bypass sandbox restrictions" },
      },
    },
    async execute(id: string, params: EditParams, onUpdate: AgentToolUpdateCallback | undefined, ctx: ExtensionContext, signal?: AbortSignal) {
      // If sandbox not enabled → run directly
      if (!state.enabled) {
        return unsafeOriginalEdit.execute(id, params, signal, onUpdate);
      }

      // Default: check if write is allowed (edit is a form of writing)
      if (!params.unsandboxed) {
        if (!isWriteAllowed(params.path, cwd, state.config)) {
          throw new Error(`Sandbox: edit denied for "${params.path}"`);
        }
        return unsafeOriginalEdit.execute(id, params, signal, onUpdate);
      }

      // Unsandboxed run
      if (!ctx.hasUI) {
        throw new Error("Cannot run unsandboxed edit: no UI available for approval");
      }

      const approved = await ctx.ui.confirm("Unsandboxed Edit", `Allow editing without sandbox?\n\n${params.path}`);

      if (!approved) {
        throw new Error("User denied permission to edit without sandbox");
      }

      return unsafeOriginalEdit.execute(id, params, signal, onUpdate);
    },
  };
}
