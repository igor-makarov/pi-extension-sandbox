import type { SandboxConfig } from "../types.js";

export interface SandboxState {
  enabled: boolean;
  config: SandboxConfig;
}
