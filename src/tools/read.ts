import { type AgentToolUpdateCallback, type ExtensionContext, type Theme, type ToolDefinition, createReadTool } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

import type { SandboxState } from "../data/SandboxState.js";
import { isReadAllowed } from "../file-ops.js";

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
    renderCall: (args: unknown, theme: Theme) => {
      const params = args as ReadParams;
      const willRunUnsandboxed = params.unsandboxed || !state.enabled;

      if (willRunUnsandboxed) {
        return new Text(theme.fg("toolTitle", theme.bold(`[unsandboxed] read: ${params.path}`)), 0, 0);
      }
      return new Text(theme.fg("toolTitle", theme.bold(`read: ${params.path}`)), 0, 0);
    },
    async execute(id: string, params: ReadParams, onUpdate: AgentToolUpdateCallback | undefined, ctx: ExtensionContext, signal?: AbortSignal) {
      // If sandbox not enabled → run directly
      if (!state.enabled) {
        return unsafeOriginalRead.execute(id, params, signal, onUpdate);
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

      return unsafeOriginalRead.execute(id, params, signal, onUpdate);
    },
  };
}
