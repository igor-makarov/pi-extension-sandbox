import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

import { loadConfig } from "../config";

export function createSandboxCommand(isSandboxEnabled: () => boolean) {
  return {
    description: "Show sandbox configuration",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      if (!isSandboxEnabled()) {
        ctx.ui.notify("Sandbox is disabled", "info");
        return;
      }

      const config = loadConfig(ctx.cwd);
      const lines = [
        "Sandbox Configuration:",
        "",
        "Bypassed Commands:",
        `  ${config.unsandboxedCommands?.join(", ") || "(none)"}`,
        "",
        "Network:",
        `  Allowed: ${config.network?.allowedDomains?.join(", ") || "(none)"}`,
        `  Denied: ${config.network?.deniedDomains?.join(", ") || "(none)"}`,
        `  Allow Local Binding: ${config.network?.allowLocalBinding ?? false}`,
        "",
        "Filesystem:",
        `  Deny Read: ${config.filesystem?.denyRead?.join(", ") || "(none)"}`,
        `  Allow Write: ${config.filesystem?.allowWrite?.join(", ") || "(none)"}`,
        `  Deny Write: ${config.filesystem?.denyWrite?.join(", ") || "(none)"}`,
      ];
      ctx.ui.notify(lines.join("\n"), "info");
    },
  };
}
