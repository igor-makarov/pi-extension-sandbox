import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { SandboxConfig } from "./types.js";

export const DEFAULT_CONFIG: SandboxConfig = {
  enabled: true,
  bypassedCommands: [],
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

  return deepMerge(deepMerge(DEFAULT_CONFIG, globalConfig), projectConfig);
}

export function deepMerge(base: SandboxConfig, overrides: Partial<SandboxConfig>): SandboxConfig {
  const result: SandboxConfig = { ...base };

  if (overrides.enabled !== undefined) result.enabled = overrides.enabled;
  if (overrides.bypassedCommands) result.bypassedCommands = overrides.bypassedCommands;
  if (overrides.network) {
    result.network = { ...base.network, ...overrides.network };
  }
  if (overrides.filesystem) {
    result.filesystem = { ...base.filesystem, ...overrides.filesystem };
  }

  const extOverrides = overrides as {
    ignoreViolations?: Record<string, string[]>;
    enableWeakerNestedSandbox?: boolean;
  };
  const extResult = result as { ignoreViolations?: Record<string, string[]>; enableWeakerNestedSandbox?: boolean };

  if (extOverrides.ignoreViolations) {
    extResult.ignoreViolations = extOverrides.ignoreViolations;
  }
  if (extOverrides.enableWeakerNestedSandbox !== undefined) {
    extResult.enableWeakerNestedSandbox = extOverrides.enableWeakerNestedSandbox;
  }

  return result;
}
