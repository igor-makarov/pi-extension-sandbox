import type { SandboxRuntimeConfig } from "@anthropic-ai/sandbox-runtime";

export interface SandboxConfig extends SandboxRuntimeConfig {
  enabled?: boolean;
  unsandboxedCommands?: string[];
}
