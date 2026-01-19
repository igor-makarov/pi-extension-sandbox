import { homedir } from "node:os";
import { describe, expect, it } from "vitest";

import { isReadAllowed } from "./file-ops.js";
import type { SandboxConfig } from "./types.js";

const baseConfig: SandboxConfig = {
  enabled: true,
  unsandboxedCommands: [],
  network: {
    allowedDomains: [],
    deniedDomains: [],
  },
  filesystem: {
    denyRead: [],
    allowWrite: [],
    denyWrite: [],
    allowGitConfig: false,
  },
};

describe("isReadAllowed", () => {
  const cwd = "/projects/myapp";
  const home = homedir();

  describe("when denyRead is empty", () => {
    it("allows any path", () => {
      const config = { ...baseConfig };
      expect(isReadAllowed("/any/path", cwd, config)).toBe(true);
      expect(isReadAllowed("~/.ssh/id_rsa", cwd, config)).toBe(true);
    });
  });

  describe("when denyRead is undefined", () => {
    it("allows any path", () => {
      const config = { ...baseConfig, filesystem: undefined } as unknown as SandboxConfig;
      expect(isReadAllowed("/any/path", cwd, config)).toBe(true);
    });
  });

  describe("with default deny patterns", () => {
    const config: SandboxConfig = {
      ...baseConfig,
      filesystem: {
        ...baseConfig.filesystem,
        denyRead: ["~/.ssh", "~/.aws", "~/.gnupg", "~/.claude", "~/.pi"],
      },
    };

    it("denies reading ~/.ssh", () => {
      expect(isReadAllowed("~/.ssh", cwd, config)).toBe(false);
      expect(isReadAllowed(`${home}/.ssh`, cwd, config)).toBe(false);
    });

    it("denies reading files inside ~/.ssh", () => {
      expect(isReadAllowed("~/.ssh/id_rsa", cwd, config)).toBe(false);
      expect(isReadAllowed("~/.ssh/config", cwd, config)).toBe(false);
      expect(isReadAllowed(`${home}/.ssh/known_hosts`, cwd, config)).toBe(false);
    });

    it("denies reading deeply nested files in ~/.ssh", () => {
      expect(isReadAllowed("~/.ssh/keys/work/id_rsa", cwd, config)).toBe(false);
    });

    it("denies reading other sensitive directories", () => {
      expect(isReadAllowed("~/.aws/credentials", cwd, config)).toBe(false);
      expect(isReadAllowed("~/.gnupg/secring.gpg", cwd, config)).toBe(false);
      expect(isReadAllowed("~/.claude/config.json", cwd, config)).toBe(false);
      expect(isReadAllowed("~/.pi/settings.json", cwd, config)).toBe(false);
    });

    it("allows reading non-sensitive paths", () => {
      expect(isReadAllowed("/etc/hosts", cwd, config)).toBe(true);
      expect(isReadAllowed("~/.bashrc", cwd, config)).toBe(true);
      expect(isReadAllowed(`${home}/Documents/file.txt`, cwd, config)).toBe(true);
    });

    it("allows reading project files", () => {
      expect(isReadAllowed("src/index.ts", cwd, config)).toBe(true);
      expect(isReadAllowed("./package.json", cwd, config)).toBe(true);
    });
  });

  describe("relative path handling", () => {
    const config: SandboxConfig = {
      ...baseConfig,
      filesystem: {
        ...baseConfig.filesystem,
        denyRead: ["/projects/myapp/secrets"],
      },
    };

    it("resolves relative paths against cwd", () => {
      expect(isReadAllowed("secrets/api.key", cwd, config)).toBe(false);
      expect(isReadAllowed("./secrets/api.key", cwd, config)).toBe(false);
    });

    it("allows relative paths outside denied directories", () => {
      expect(isReadAllowed("src/index.ts", cwd, config)).toBe(true);
    });
  });

  describe("glob patterns", () => {
    const config: SandboxConfig = {
      ...baseConfig,
      filesystem: {
        ...baseConfig.filesystem,
        denyRead: [".env", ".env.*", "*.pem", "*.key", ".claude", ".pi"],
      },
    };

    it("denies files matching glob patterns", () => {
      expect(isReadAllowed("server.pem", cwd, config)).toBe(false);
      expect(isReadAllowed("private.key", cwd, config)).toBe(false);
      expect(isReadAllowed(".env.local", cwd, config)).toBe(false);
      expect(isReadAllowed(".env.production", cwd, config)).toBe(false);
    });

    it("denies exact basename matches", () => {
      expect(isReadAllowed(".env", cwd, config)).toBe(false);
      expect(isReadAllowed(".claude", cwd, config)).toBe(false);
      expect(isReadAllowed(".pi", cwd, config)).toBe(false);
    });

    it("denies nested files matching glob patterns", () => {
      expect(isReadAllowed("certs/server.pem", cwd, config)).toBe(false);
      expect(isReadAllowed("/absolute/path/to/private.key", cwd, config)).toBe(false);
      expect(isReadAllowed("config/.env", cwd, config)).toBe(false);
      expect(isReadAllowed("/some/path/.claude", cwd, config)).toBe(false);
    });

    it("allows files not matching glob patterns", () => {
      expect(isReadAllowed("server.cert", cwd, config)).toBe(true);
      expect(isReadAllowed("config.json", cwd, config)).toBe(true);
      expect(isReadAllowed(".envrc", cwd, config)).toBe(true);
    });
  });
});
