import deepmerge from "deepmerge";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { SandboxConfig } from "./types";

export const DEFAULT_CONFIG: SandboxConfig = {
  enabled: true,
  unsandboxedCommands: [],
  network: {
    allowedDomains: [],
    deniedDomains: [],
  },
  filesystem: {
    denyRead: [
      // where the secrets are
      "~/.ssh",
      "~/.aws",
      "~/.gnupg",
      "~/.claude",
      "~/.pi",
    ],
    allowWrite: [
      // cwd
      ".",
      // weird files
      "/dev/stdout",
      "/dev/stderr",
      "/dev/null",
      "/dev/tty",
      "/dev/dtracehelper",
      "/dev/autofs_nowait",
      "/tmp/pi",
      "/private/tmp/pi",
    ],
    denyWrite: [
      // also secrets
      ".env",
      ".env.*",
      "*.pem",
      "*.key",
      ".claude",
      ".pi",
    ],
    allowGitConfig: false,
  },
};

export function loadConfig(cwd: string): SandboxConfig {
  const projectConfigPath = join(cwd, ".pi", "sandbox.json");
  const globalConfigPath = join(homedir(), ".pi", "agent", "sandbox.json");

  let globalConfig: Partial<SandboxConfig> = {};
  let projectConfig: Partial<SandboxConfig> = {};

  if (existsSync(globalConfigPath)) {
    try {
      globalConfig = JSON.parse(readFileSync(globalConfigPath, "utf-8"));
    } catch (e) {
      console.error(`Warning: Could not parse ${globalConfigPath}: ${e}`);
    }
  }

  if (existsSync(projectConfigPath)) {
    try {
      projectConfig = JSON.parse(readFileSync(projectConfigPath, "utf-8"));
    } catch (e) {
      console.error(`Warning: Could not parse ${projectConfigPath}: ${e}`);
    }
  }

  return deepmerge.all<SandboxConfig>([DEFAULT_CONFIG, globalConfig, projectConfig]);
}
