import { SandboxManager } from "@anthropic-ai/sandbox-runtime";
import type { BashOperations } from "@mariozechner/pi-coding-agent";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { parse } from "shell-quote";

export function createSandboxedBashOps(): BashOperations {
  return {
    async exec(command, cwd, { onData, signal, timeout }) {
      if (!existsSync(cwd)) {
        throw new Error(`Working directory does not exist: ${cwd}`);
      }

      const wrappedCommand = await SandboxManager.wrapWithSandbox(command);

      return new Promise((resolve, reject) => {
        const child = spawn("bash", ["-c", wrappedCommand], {
          cwd,
          detached: true,
          stdio: ["ignore", "pipe", "pipe"],
        });

        let timedOut = false;
        let timeoutHandle: NodeJS.Timeout | undefined;

        if (timeout !== undefined && timeout > 0) {
          timeoutHandle = setTimeout(() => {
            timedOut = true;
            if (child.pid) {
              try {
                process.kill(-child.pid, "SIGKILL");
              } catch {
                child.kill("SIGKILL");
              }
            }
          }, timeout * 1000);
        }

        child.stdout?.on("data", onData);
        child.stderr?.on("data", onData);

        child.on("error", (err) => {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          reject(err);
        });

        const onAbort = () => {
          if (child.pid) {
            try {
              process.kill(-child.pid, "SIGKILL");
            } catch {
              child.kill("SIGKILL");
            }
          }
        };

        signal?.addEventListener("abort", onAbort, { once: true });

        child.on("close", (code) => {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          signal?.removeEventListener("abort", onAbort);

          if (signal?.aborted) {
            reject(new Error("aborted"));
          } else if (timedOut) {
            reject(new Error(`timeout:${timeout}`));
          } else {
            // Annotate stderr with sandbox violations if command failed
            if (code !== 0) {
              const stderrOutput = "";
              const annotated = SandboxManager.annotateStderrWithSandboxFailures(command, stderrOutput);
              onData(Buffer.from(annotated));
            }

            resolve({ exitCode: code });
          }
        });
      });
    },
  };
}

/**
 * Checks if a command matches any of the unsandboxed command patterns.
 * Uses shell-quote to properly parse commands, handling quotes and escapes.
 *
 * - Exact match: "npm test" matches only "npm test"
 * - Prefix match: "npm run *" matches "npm run build", "npm run test", etc.
 * - Compound commands (with &&, ||, |, ;, redirects) are never matched for safety.
 */
export function isUnsandboxedCommand(command: string, unsandboxedCommands: string[]): boolean {
  const commandTokens = parseCommand(command);
  if ("isCompound" in commandTokens) {
    return false;
  }

  for (const pattern of unsandboxedCommands) {
    const { tokens: patternTokens, isPrefixMatch } = parsePattern(pattern);

    if (isPrefixMatch) {
      // Prefix match: command must have at least as many tokens as pattern (minus the *)
      if (patternTokens.length > commandTokens.length) continue;
      const matches = patternTokens.every((token, i) => token === commandTokens[i]);
      if (matches) return true;
    } else {
      // Exact match: command must have exactly the same tokens
      if (patternTokens.length !== commandTokens.length) continue;
      const matches = patternTokens.every((token, i) => token === commandTokens[i]);
      if (matches) return true;
    }
  }

  return false;
}

/**
 * Parses a command string into tokens. Globs are converted to their pattern strings.
 * Returns { isCompound: true } if the command contains shell operators (&&, ||, |, ;, redirects, etc.)
 */
function parseCommand(command: string): string[] | { isCompound: true } {
  const parsed = parse(command.trim());
  const tokens: string[] = [];
  for (const token of parsed) {
    if (typeof token === "string") {
      tokens.push(token);
    } else if ("op" in token && token.op === "glob") {
      tokens.push(token.pattern);
    } else {
      return { isCompound: true };
    }
  }
  return tokens;
}

/**
 * Parses a pattern string into tokens and determines if it's a prefix match (ends with *).
 */
function parsePattern(pattern: string): { tokens: string[]; isPrefixMatch: boolean } {
  const parsed = parse(pattern.trim());
  const tokens = parsed.filter((t): t is string => typeof t === "string");
  const lastToken = parsed[parsed.length - 1];
  const isPrefixMatch = typeof lastToken === "object" && "op" in lastToken && lastToken.op === "glob" && lastToken.pattern === "*";
  return { tokens, isPrefixMatch };
}
