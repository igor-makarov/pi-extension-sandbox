import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

import { loadConfig } from "@/src/config.js";

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
        `  ${config.bypassedCommands?.join(", ") || "(none)"}`,
        "",
        "Network:",
        `  Allowed: ${config.network?.allowedDomains?.join(", ") || "(none)"}`,
        `  Denied: ${config.network?.deniedDomains?.join(", ") || "(none)"}`,
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
