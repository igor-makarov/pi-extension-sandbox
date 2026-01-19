import { describe, expect, it } from "vitest";

import { isUnsandboxedCommand } from "./sandbox-ops";

describe("isUnsandboxedCommand", () => {
  describe("exact match (no wildcard)", () => {
    it("matches exact command", () => {
      expect(isUnsandboxedCommand("npm test", ["npm test"])).toBe(true);
    });

    it("does not match different command", () => {
      expect(isUnsandboxedCommand("npm build", ["npm test"])).toBe(false);
    });

    it("does not match command with extra arguments", () => {
      expect(isUnsandboxedCommand("npm test --coverage", ["npm test"])).toBe(false);
    });

    it("does not match shorter command", () => {
      expect(isUnsandboxedCommand("npm", ["npm test"])).toBe(false);
    });

    it("handles whitespace trimming", () => {
      expect(isUnsandboxedCommand("  npm test  ", ["npm test"])).toBe(true);
      expect(isUnsandboxedCommand("npm test", ["  npm test  "])).toBe(true);
    });
  });

  describe("prefix match (with * wildcard)", () => {
    it("matches command with additional arguments", () => {
      expect(isUnsandboxedCommand("npm run build", ["npm run *"])).toBe(true);
      expect(isUnsandboxedCommand("npm run test", ["npm run *"])).toBe(true);
      expect(isUnsandboxedCommand("npm run lint:fix", ["npm run *"])).toBe(true);
    });

    it("matches exact prefix (no extra args)", () => {
      expect(isUnsandboxedCommand("npm run", ["npm run *"])).toBe(true);
    });

    it("matches single token prefix", () => {
      expect(isUnsandboxedCommand("git status", ["git *"])).toBe(true);
      expect(isUnsandboxedCommand("git commit -m test", ["git *"])).toBe(true);
      expect(isUnsandboxedCommand("git", ["git *"])).toBe(true);
    });

    it("does not match when command is shorter than pattern", () => {
      expect(isUnsandboxedCommand("npm", ["npm run *"])).toBe(false);
    });

    it("does not match partial token", () => {
      expect(isUnsandboxedCommand("npm-run build", ["npm *"])).toBe(false);
      expect(isUnsandboxedCommand("npmlint", ["npm *"])).toBe(false);
    });

    it("does not match different prefix", () => {
      expect(isUnsandboxedCommand("yarn run build", ["npm run *"])).toBe(false);
    });
  });

  describe("multiple patterns", () => {
    it("matches if any pattern matches", () => {
      const patterns = ["npm test", "yarn *", "pnpm exec *"];
      expect(isUnsandboxedCommand("npm test", patterns)).toBe(true);
      expect(isUnsandboxedCommand("yarn install", patterns)).toBe(true);
      expect(isUnsandboxedCommand("pnpm exec vitest", patterns)).toBe(true);
    });

    it("does not match if no pattern matches", () => {
      const patterns = ["npm test", "yarn *"];
      expect(isUnsandboxedCommand("npm run build", patterns)).toBe(false);
      expect(isUnsandboxedCommand("pnpm install", patterns)).toBe(false);
    });
  });

  describe("quoted arguments", () => {
    it("handles single quoted arguments in exact match", () => {
      expect(isUnsandboxedCommand("echo 'hello world'", ["echo 'hello world'"])).toBe(true);
    });

    it("handles double quoted arguments in exact match", () => {
      expect(isUnsandboxedCommand('echo "hello world"', ['echo "hello world"'])).toBe(true);
    });

    it("handles quoted arguments in prefix match", () => {
      expect(isUnsandboxedCommand("git commit -m 'hello world'", ["git commit *"])).toBe(true);
      expect(isUnsandboxedCommand('git commit -m "hello world"', ["git commit *"])).toBe(true);
    });
  });

  describe("compound commands are rejected", () => {
    it("rejects commands with &&", () => {
      expect(isUnsandboxedCommand("npm test && npm build", ["npm test"])).toBe(false);
      expect(isUnsandboxedCommand("npm test && npm build", ["npm test *"])).toBe(false);
      expect(isUnsandboxedCommand("npm test && npm build", ["npm *"])).toBe(false);
    });

    it("rejects commands with ||", () => {
      expect(isUnsandboxedCommand("npm test || npm build", ["npm test"])).toBe(false);
      expect(isUnsandboxedCommand("npm test || npm build", ["npm *"])).toBe(false);
    });

    it("rejects commands with pipes", () => {
      expect(isUnsandboxedCommand("cat file.txt | grep pattern", ["cat file.txt"])).toBe(false);
      expect(isUnsandboxedCommand("cat file.txt | grep pattern", ["cat *"])).toBe(false);
    });

    it("rejects commands with semicolons", () => {
      expect(isUnsandboxedCommand("npm test; npm build", ["npm test"])).toBe(false);
      expect(isUnsandboxedCommand("npm test; npm build", ["npm *"])).toBe(false);
    });

    it("rejects commands with redirects", () => {
      expect(isUnsandboxedCommand("echo hello > file.txt", ["echo hello"])).toBe(false);
      expect(isUnsandboxedCommand("cat < input.txt", ["cat"])).toBe(false);
      expect(isUnsandboxedCommand("npm test 2>&1", ["npm test"])).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("returns false for empty patterns array", () => {
      expect(isUnsandboxedCommand("npm test", [])).toBe(false);
    });

    it("skips empty pattern strings", () => {
      expect(isUnsandboxedCommand("npm test", ["", "npm test"])).toBe(true);
      expect(isUnsandboxedCommand("npm test", ["", "   "])).toBe(false);
    });

    it("handles standalone * pattern (matches any simple command)", () => {
      expect(isUnsandboxedCommand("npm test", ["*"])).toBe(true);
      expect(isUnsandboxedCommand("git status", ["*"])).toBe(true);
      // But not compound commands
      expect(isUnsandboxedCommand("npm test && npm build", ["*"])).toBe(false);
    });
  });
});
