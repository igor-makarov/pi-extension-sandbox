import { type AgentToolUpdateCallback, type ExtensionContext, type Theme, type ToolDefinition, createWriteTool } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

import type { SandboxState } from "../data/SandboxState.js";
import { isWriteAllowed } from "../file-ops.js";

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
    renderCall: (args: unknown, theme: Theme) => {
      const params = args as WriteParams;
      const willRunUnsandboxed = params.unsandboxed || !state.enabled;
      const path = params.path || "";
      const pathDisplay = path ? theme.fg("accent", path) : theme.fg("toolOutput", "...");

      if (willRunUnsandboxed) {
        return new Text(theme.fg("toolTitle", theme.bold("[unsandboxed] write")) + " " + pathDisplay, 0, 0);
      }
      return new Text(theme.fg("toolTitle", theme.bold("write")) + " " + pathDisplay, 0, 0);
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
