import { type AgentToolUpdateCallback, type ToolDefinition, createReadTool } from "@mariozechner/pi-coding-agent";

import type { SandboxState } from "../data/SandboxState.js";
import { isReadAllowed } from "../file-ops.js";

type ReadParams = {
  path: string;
  offset?: number;
  limit?: number;
};

export function createSandboxedReadTool(cwd: string, state: SandboxState): ToolDefinition {
  const unsafeOriginalRead = createReadTool(cwd);

  return {
    ...unsafeOriginalRead,
    async execute(id: string, params: ReadParams, onUpdate: AgentToolUpdateCallback | undefined, _ctx: unknown, signal?: AbortSignal) {
      if (!state.enabled) {
        return unsafeOriginalRead.execute(id, params, signal, onUpdate);
      }

      if (!isReadAllowed(params.path, cwd, state.config)) {
        throw new Error(`Sandbox: read denied for "${params.path}"`);
      }

      return unsafeOriginalRead.execute(id, params, signal, onUpdate);
    },
  };
}
