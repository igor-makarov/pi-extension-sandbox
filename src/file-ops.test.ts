import { homedir } from "node:os";
import { describe, expect, it } from "vitest";

import { pathMatchesPattern } from "./file-ops.js";

describe("pathMatchesPattern", () => {
  const home = homedir();

  describe("tilde expansion", () => {
    it("expands ~ in pattern to home directory", () => {
      expect(pathMatchesPattern(`${home}/.ssh`, "~/.ssh")).toBe(true);
      expect(pathMatchesPattern(`${home}/.ssh/id_rsa`, "~/.ssh")).toBe(true);
    });

    it("expands standalone ~ in pattern", () => {
      expect(pathMatchesPattern(home, "~")).toBe(true);
      expect(pathMatchesPattern(`${home}/Documents`, "~")).toBe(true);
    });
  });

  describe("directory matching", () => {
    it("matches exact directory path", () => {
      expect(pathMatchesPattern(`${home}/.ssh`, "~/.ssh")).toBe(true);
      expect(pathMatchesPattern(`${home}/.aws`, "~/.aws")).toBe(true);
      expect(pathMatchesPattern(`${home}/.gnupg`, "~/.gnupg")).toBe(true);
      expect(pathMatchesPattern(`${home}/.claude`, "~/.claude")).toBe(true);
      expect(pathMatchesPattern(`${home}/.pi`, "~/.pi")).toBe(true);
    });

    it("matches files inside directory", () => {
      expect(pathMatchesPattern(`${home}/.ssh/id_rsa`, "~/.ssh")).toBe(true);
      expect(pathMatchesPattern(`${home}/.ssh/config`, "~/.ssh")).toBe(true);
      expect(pathMatchesPattern(`${home}/.ssh/known_hosts`, "~/.ssh")).toBe(true);
      expect(pathMatchesPattern(`${home}/.aws/credentials`, "~/.aws")).toBe(true);
      expect(pathMatchesPattern(`${home}/.gnupg/secring.gpg`, "~/.gnupg")).toBe(true);
      expect(pathMatchesPattern(`${home}/.claude/config.json`, "~/.claude")).toBe(true);
      expect(pathMatchesPattern(`${home}/.pi/settings.json`, "~/.pi")).toBe(true);
    });

    it("matches deeply nested files", () => {
      expect(pathMatchesPattern(`${home}/.ssh/keys/work/id_rsa`, "~/.ssh")).toBe(true);
    });

    it("does not match unrelated paths", () => {
      expect(pathMatchesPattern("/etc/hosts", "~/.ssh")).toBe(false);
      expect(pathMatchesPattern(`${home}/.bashrc`, "~/.ssh")).toBe(false);
      expect(pathMatchesPattern(`${home}/Documents/file.txt`, "~/.ssh")).toBe(false);
    });

    it("does not match paths that merely start with pattern", () => {
      expect(pathMatchesPattern(`${home}/.ssh-backup`, "~/.ssh")).toBe(false);
    });
  });

  describe("absolute path matching", () => {
    it("matches absolute path patterns", () => {
      expect(pathMatchesPattern("/projects/myapp/secrets/api.key", "/projects/myapp/secrets")).toBe(true);
      expect(pathMatchesPattern("/projects/myapp/secrets", "/projects/myapp/secrets")).toBe(true);
    });

    it("does not match paths outside pattern", () => {
      expect(pathMatchesPattern("/projects/myapp/src/index.ts", "/projects/myapp/secrets")).toBe(false);
    });
  });

  describe("glob patterns", () => {
    it("matches wildcard extension patterns", () => {
      expect(pathMatchesPattern("/projects/server.pem", "*.pem")).toBe(true);
      expect(pathMatchesPattern("/projects/private.key", "*.key")).toBe(true);
    });

    it("matches dotfile wildcard patterns", () => {
      expect(pathMatchesPattern("/projects/.env.local", ".env.*")).toBe(true);
      expect(pathMatchesPattern("/projects/.env.production", ".env.*")).toBe(true);
    });

    it("matches exact basename patterns", () => {
      expect(pathMatchesPattern("/projects/.env", ".env")).toBe(true);
      expect(pathMatchesPattern("/projects/.claude", ".claude")).toBe(true);
      expect(pathMatchesPattern("/projects/.pi", ".pi")).toBe(true);
    });

    it("matches nested files with basename patterns", () => {
      expect(pathMatchesPattern("/projects/certs/server.pem", "*.pem")).toBe(true);
      expect(pathMatchesPattern("/absolute/path/to/private.key", "*.key")).toBe(true);
      expect(pathMatchesPattern("/projects/config/.env", ".env")).toBe(true);
      expect(pathMatchesPattern("/some/path/.claude", ".claude")).toBe(true);
    });

    it("does not match files with different extensions", () => {
      expect(pathMatchesPattern("/projects/server.cert", "*.pem")).toBe(false);
      expect(pathMatchesPattern("/projects/config.json", "*.key")).toBe(false);
    });

    it("does not match similar but different basenames", () => {
      expect(pathMatchesPattern("/projects/.envrc", ".env")).toBe(false);
      expect(pathMatchesPattern("/projects/.envrc", ".env.*")).toBe(false);
    });
  });
});
