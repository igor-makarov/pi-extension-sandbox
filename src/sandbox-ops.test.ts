import { describe, expect, it } from "vitest";

import { findUnsandboxedCompoundMatches, isUnsandboxedCommand } from "./sandbox-ops";

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

  describe("safe trailing redirects", () => {
    it("allows trailing 2>&1 with wildcard pattern", () => {
      expect(isUnsandboxedCommand("mcporter auth atlassian 2>&1", ["mcporter *"])).toBe(true);
    });

    it("allows trailing 2>&1 with exact pattern", () => {
      expect(isUnsandboxedCommand("npm test 2>&1", ["npm test"])).toBe(true);
    });

    it("allows trailing 2>/dev/null", () => {
      expect(isUnsandboxedCommand("find . -name '*.ts' 2>/dev/null", ["find *"])).toBe(true);
    });

    it("allows trailing >/dev/null 2>&1", () => {
      expect(isUnsandboxedCommand("command -v node >/dev/null 2>&1", ["command *"])).toBe(true);
    });

    it("allows trailing &>/dev/null (bash shorthand)", () => {
      expect(isUnsandboxedCommand("command -v node &>/dev/null", ["command *"])).toBe(true);
    });

    it("rejects output redirects to file", () => {
      expect(isUnsandboxedCommand("mcporter bla > /etc/passwd", ["mcporter *"])).toBe(false);
      expect(isUnsandboxedCommand("mcporter bla >> /etc/passwd", ["mcporter *"])).toBe(false);
    });

    it("rejects input redirects from file", () => {
      expect(isUnsandboxedCommand("mcporter bla < /etc/passwd", ["mcporter *"])).toBe(false);
    });

    it("rejects redirects to /dev/null from non-trailing position", () => {
      expect(isUnsandboxedCommand("mcporter 2>/dev/null auth", ["mcporter *"])).toBe(false);
    });

    it("rejects 2>&1 in non-trailing position", () => {
      expect(isUnsandboxedCommand("mcporter 2>&1 auth atlassian", ["mcporter *"])).toBe(false);
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

describe("findUnsandboxedCompoundMatches", () => {
  it("returns [] for non-compound commands (even if they would match)", () => {
    expect(findUnsandboxedCompoundMatches("npm test", ["npm test"])).toEqual([]);
    expect(findUnsandboxedCompoundMatches("git status", ["git *"])).toEqual([]);
  });

  it("returns [] for non-compound commands that do not match", () => {
    expect(findUnsandboxedCompoundMatches("npm build", ["npm test"])).toEqual([]);
  });

  it("returns [] for compound commands with no matching component", () => {
    expect(findUnsandboxedCompoundMatches("ls && pwd", ["npm test"])).toEqual([]);
  });

  it("detects match on left side of &&", () => {
    expect(findUnsandboxedCompoundMatches("npm test && npm build", ["npm test"])).toEqual([{ subcommand: "npm test", pattern: "npm test" }]);
  });

  it("detects match on right side of &&", () => {
    expect(findUnsandboxedCompoundMatches("ls && git status", ["git *"])).toEqual([{ subcommand: "git status", pattern: "git *" }]);
  });

  it("detects matches across both sides of a pipe", () => {
    expect(findUnsandboxedCompoundMatches("xcrun simctl list | head -10", ["xcrun simctl *"])).toEqual([
      { subcommand: "xcrun simctl list", pattern: "xcrun simctl *" },
    ]);
  });

  it("detects match when 2>&1 is followed by a pipe", () => {
    expect(findUnsandboxedCompoundMatches("mcporter auth atlassian 2>&1 | tail -60", ["mcporter *"])).toEqual([
      { subcommand: "mcporter auth atlassian", pattern: "mcporter *" },
    ]);
  });

  it("detects match when 2>&1 is followed by a pipe (exact pattern)", () => {
    expect(findUnsandboxedCompoundMatches("npm test 2>&1 | tail -60", ["npm test"])).toEqual([{ subcommand: "npm test", pattern: "npm test" }]);
  });

  it("detects matches across ; separated commands", () => {
    expect(findUnsandboxedCompoundMatches("echo hi; git status", ["git *"])).toEqual([{ subcommand: "git status", pattern: "git *" }]);
  });

  it("detects match when command has a write redirect", () => {
    expect(findUnsandboxedCompoundMatches("mcporter foo > /tmp/out.txt", ["mcporter *"])).toEqual([
      { subcommand: "mcporter foo", pattern: "mcporter *" },
    ]);
  });

  it("detects match when command has a read redirect", () => {
    expect(findUnsandboxedCompoundMatches("cat < input.txt", ["cat *"])).toEqual([{ subcommand: "cat", pattern: "cat *" }]);
  });

  it("returns all matching components", () => {
    expect(findUnsandboxedCompoundMatches("npm test && npm build", ["npm *"])).toEqual([
      { subcommand: "npm test", pattern: "npm *" },
      { subcommand: "npm build", pattern: "npm *" },
    ]);
  });

  it("ignores safe trailing redirects", () => {
    // Safe trailing redirects do not count as compound for this check either.
    expect(findUnsandboxedCompoundMatches("mcporter auth 2>&1", ["mcporter *"])).toEqual([]);
    expect(findUnsandboxedCompoundMatches("mcporter auth 2>/dev/null", ["mcporter *"])).toEqual([]);
    expect(findUnsandboxedCompoundMatches("mcporter auth >/dev/null 2>&1", ["mcporter *"])).toEqual([]);
  });

  it("only reports first matching pattern per component", () => {
    expect(findUnsandboxedCompoundMatches("npm test | head", ["npm test", "npm *"])).toEqual([{ subcommand: "npm test", pattern: "npm test" }]);
  });

  it("ignores empty patterns", () => {
    expect(findUnsandboxedCompoundMatches("npm test && ls", ["", "   "])).toEqual([]);
  });

  it("handles quoted arguments inside compound", () => {
    expect(findUnsandboxedCompoundMatches("git commit -m 'hello world' && git push", ["git commit *"])).toEqual([
      { subcommand: "git commit -m hello world", pattern: "git commit *" },
    ]);
  });
});
