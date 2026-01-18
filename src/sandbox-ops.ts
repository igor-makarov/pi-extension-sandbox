import { SandboxManager } from "@anthropic-ai/sandbox-runtime";
import type { BashOperations } from "@mariozechner/pi-coding-agent";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

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
            const stderrOutput = "";
            const annotated = SandboxManager.annotateStderrWithSandboxFailures(command, stderrOutput);
            if (annotated !== stderrOutput) {
              const extra = annotated.replace(stderrOutput, "").trim();
              if (extra) {
                onData(Buffer.from(`\n${extra}\n\nUse the bash_unsandboxed_with_permission tool instead. It will ask the user for permission.\n`));
              }
            }

            resolve({ exitCode: code });
          }
        });
      });
    },
  };
}

export function isUnsandboxedCommand(command: string, unsandboxedCommands: string[]): boolean {
  const trimmedCommand = command.trim();
  for (const pattern of unsandboxedCommands) {
    if (trimmedCommand === pattern.trim()) {
      return true;
    }
  }
  return false;
}
