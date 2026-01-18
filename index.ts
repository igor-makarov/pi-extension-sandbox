/**
 * Sandbox Extension - OS-level sandboxing for bash commands
 *
 * Uses @anthropic-ai/sandbox-runtime to enforce filesystem and network
 * restrictions on bash commands at the OS level (sandbox-exec on macOS,
 * bubblewrap on Linux).
 *
 * Config files (merged, project takes precedence):
 * - ~/.pi/agent/sandbox.json (global)
 * - <cwd>/.pi/sandbox.json (project-local)
 *
 * Example .pi/sandbox.json:
 * ```json
 * {
 *   "enabled": true,
 *   "bypassedCommands": ["docker", "git push"],
 *   "network": {
 *     "allowedDomains": ["github.com", "*.github.com"],
 *     "deniedDomains": []
 *   },
 *   "filesystem": {
 *     "denyRead": ["~/.ssh", "~/.aws"],
 *     "allowWrite": [".", "/tmp"],
 *     "denyWrite": [".env"]
 *   }
 * }
 * ```
 *
 * Usage:
 * - `pi -e ./sandbox` - sandbox enabled with default/config settings
 * - `pi -e ./sandbox --no-sandbox` - disable sandboxing
 * - `/sandbox` - show current sandbox configuration
 *
 * Setup:
 * 1. Copy sandbox/ directory to ~/.pi/agent/extensions/
 * 2. Run `npm install` in ~/.pi/agent/extensions/sandbox/
 *
 * Linux also requires: bubblewrap, socat, ripgrep
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { SandboxManager, type SandboxRuntimeConfig } from "@anthropic-ai/sandbox-runtime";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { type BashOperations, createBashTool } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

interface SandboxConfig extends SandboxRuntimeConfig {
	enabled?: boolean;
	bypassedCommands?: string[];
}

const DEFAULT_CONFIG: SandboxConfig = {
	enabled: true,
	bypassedCommands: [],
	network: {
		allowedDomains: [],
		deniedDomains: [],
	},
	filesystem: {
		denyRead: ["~/.ssh", "~/.aws", "~/.gnupg", "~/.claude", ".claude", "~/.pi", ".pi"],
		allowWrite: [
			"/dev/stdout",
			"/dev/stderr",
			"/dev/null",
			"/dev/tty",
			"/dev/dtracehelper",
			"/dev/autofs_nowait",
			"/tmp/pi",
			"/private/tmp/pi",
			".",
		],
		denyWrite: [".env", ".env.*", "*.pem", "*.key", ".claude", ".pi"],
		allowGitConfig: false,
	},
};

function loadConfig(cwd: string): SandboxConfig {
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

function deepMerge(base: SandboxConfig, overrides: Partial<SandboxConfig>): SandboxConfig {
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

function createSandboxedBashOps(): BashOperations {
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
								onData(
									Buffer.from(
										`\n${extra}\n\nUse the bash_unsandboxed_with_permission tool instead. It will ask the user for permission.\n`,
									),
								);
							}
						}

						resolve({ exitCode: code });
					}
				});
			});
		},
	};
}

function shouldBypassSandbox(command: string, bypassedCommands: string[]): boolean {
	const trimmedCommand = command.trim();
	for (const pattern of bypassedCommands) {
		if (trimmedCommand === pattern.trim()) {
			return true;
		}
	}
	return false;
}

export default function (pi: ExtensionAPI) {
	pi.registerFlag("no-sandbox", {
		description: "Disable OS-level sandboxing for bash commands",
		type: "boolean",
		default: false,
	});

	const localCwd = process.cwd();
	const localBash = createBashTool(localCwd);

	let sandboxEnabled = false;
	let sandboxInitialized = false;
	let currentConfig: SandboxConfig = DEFAULT_CONFIG;

	pi.registerTool({
		...localBash,
		label: "bash (sandboxed)",
		async execute(id, params, onUpdate, _ctx, signal) {
			if (!sandboxEnabled || !sandboxInitialized) {
				return localBash.execute(id, params, signal, onUpdate);
			}

			const command = (params as { command: string }).command;
			if (shouldBypassSandbox(command, currentConfig.bypassedCommands ?? [])) {
				return localBash.execute(id, params, signal, onUpdate);
			}

			const sandboxedBash = createBashTool(localCwd, {
				operations: createSandboxedBashOps(),
			});
			return sandboxedBash.execute(id, params, signal, onUpdate);
		},
	});

	// Tool for running commands without sandbox (requires user approval)
	pi.registerTool({
		...localBash,
		name: "bash_unsandboxed_with_permission",
		label: "bash (unsandboxed)",
		description:
			"Run a bash command WITHOUT sandbox restrictions. Use this when a command fails due to sandbox restrictions and you need to bypass them. This command asks the user for approval.",
		renderCall: (args, theme) => {
			const command = args?.command || "...";
			return new Text(theme.fg("toolTitle", theme.bold(`[unsandboxed] $ ${command}`)), 0, 0);
		},
		async execute(id, params, onUpdate, ctx, signal) {
			if (!ctx.hasUI) {
				return {
					type: "tool_result",
					content: [{ type: "text", text: "Cannot run unsandboxed command: no UI available for approval" }],
					isError: true,
					details: undefined,
				};
			}

			const command = (params as { command: string }).command;
			const approved = await ctx.ui.confirm(
				"Unsandboxed Command",
				`Allow running without sandbox?\n\n${command.slice(0, 500)}${command.length > 500 ? "..." : ""}`,
			);

			if (!approved) {
				return {
					type: "tool_result",
					content: [{ type: "text", text: "User denied permission to run command without sandbox" }],
					isError: true,
					details: undefined,
				};
			}

			return localBash.execute(id, params, signal, onUpdate);
		},
	});

	pi.on("user_bash", () => {
		if (!sandboxEnabled || !sandboxInitialized) return;
		return { operations: createSandboxedBashOps() };
	});

	pi.on("session_start", async (_event, ctx) => {
		const noSandbox = pi.getFlag("no-sandbox") as boolean;

		if (noSandbox) {
			sandboxEnabled = false;
			ctx.ui.notify("Sandbox disabled via --no-sandbox", "warning");
			return;
		}

		const config = loadConfig(ctx.cwd);
		currentConfig = config;

		if (!config.enabled) {
			sandboxEnabled = false;
			ctx.ui.notify("Sandbox disabled via config", "info");
			return;
		}

		const platform = process.platform;
		if (platform !== "darwin" && platform !== "linux") {
			sandboxEnabled = false;
			ctx.ui.notify(`Sandbox not supported on ${platform}`, "warning");
			return;
		}

		try {
			const configExt = config as unknown as {
				ignoreViolations?: Record<string, string[]>;
				enableWeakerNestedSandbox?: boolean;
			};

			await SandboxManager.initialize(
				{
					network: config.network,
					filesystem: config.filesystem,
					ignoreViolations: configExt.ignoreViolations,
					enableWeakerNestedSandbox: configExt.enableWeakerNestedSandbox,
				},
				undefined,
				true, // enableLogMonitor - required for annotateStderrWithSandboxFailures
			);

			sandboxEnabled = true;
			sandboxInitialized = true;

			const networkCount = config.network?.allowedDomains?.length ?? 0;
			const writeCount = config.filesystem?.allowWrite?.length ?? 0;
			ctx.ui.setStatus(
				"sandbox",
				ctx.ui.theme.fg("accent", `🔒 Sandbox: ${networkCount} domains, ${writeCount} write paths`),
			);
			ctx.ui.notify("Sandbox initialized", "info");
		} catch (err) {
			sandboxEnabled = false;
			ctx.ui.notify(`Sandbox initialization failed: ${err instanceof Error ? err.message : err}`, "error");
		}
	});

	pi.on("session_shutdown", async () => {
		if (sandboxInitialized) {
			try {
				await SandboxManager.reset();
			} catch {
				// Ignore cleanup errors
			}
		}
	});

	pi.registerCommand("sandbox", {
		description: "Show sandbox configuration",
		handler: async (_args, ctx) => {
			if (!sandboxEnabled) {
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
	});
}
