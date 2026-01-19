import { type AgentToolUpdateCallback, type ExtensionContext, type ToolDefinition, createBashTool } from "@mariozechner/pi-coding-agent";

import type { SandboxState } from "../data/SandboxState";
import { createSandboxedBashOps, isUnsandboxedCommand } from "../sandbox-ops";

type BashParams = {
  command: string;
  timeout?: number;
  unsandboxed?: boolean;
};

export function createSandboxedBashTool(cwd: string, state: SandboxState): ToolDefinition {
  const unsafeOriginalBash = createBashTool(cwd);
  const sandboxedBash = createBashTool(cwd, {
    operations: createSandboxedBashOps(),
  });
  return {
    ...unsafeOriginalBash,
    description: `${unsafeOriginalBash.description} Runs the command in an OS sandbox by default. Allows escalation via a UI prompt.`,
    parameters: {
      ...unsafeOriginalBash.parameters,
      properties: {
        ...unsafeOriginalBash.parameters.properties,
        unsandboxed: { type: "boolean" as const, description: "Show UI to user to bypass sandbox restrictions" },
      },
    },
    async execute(id: string, params: BashParams, onUpdate: AgentToolUpdateCallback | undefined, ctx: ExtensionContext, signal?: AbortSignal) {
      // Check if command is in auto-approved unsandboxed list
      const isAutoApproved = isUnsandboxedCommand(params.command, state.config.unsandboxedCommands ?? []);

      // If sandbox not enabled or command is auto-approved → run directly
      if (!state.enabled || isAutoApproved) {
        onUpdate?.({ content: [{ type: "text", text: "[unsandboxed]" }], details: {} });
        const result = await unsafeOriginalBash.execute(id, params, signal, onUpdate);
        result.content = [...result.content, { type: "text", text: "[unsandboxed]" }];
        return result;
      }

      // Default: execute in sandbox
      if (!params.unsandboxed) {
        return sandboxedBash.execute(id, params, signal, onUpdate);
      }

      // Unsandboxed run
      if (!ctx.hasUI) {
        throw new Error("Cannot run unsandboxed command: no UI available for approval");
      }

      const approved = await ctx.ui.confirm("Unsandboxed Command", `Allow running without sandbox?\n\n${params.command}`);

      if (!approved) {
        throw new Error("User denied permission to run command without sandbox");
      }

      onUpdate?.({ content: [{ type: "text", text: "[unsandboxed]" }], details: {} });
      const result = await unsafeOriginalBash.execute(id, params, signal, onUpdate);
      result.content = [...result.content, { type: "text", text: "[unsandboxed]" }];
      return result;
    },
  };
}
