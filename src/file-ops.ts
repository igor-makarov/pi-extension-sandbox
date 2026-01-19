import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import picomatch from "picomatch";

import type { SandboxConfig } from "./types.js";

/**
 * Checks if reading from a path is allowed by sandbox config.
 */
export function isReadAllowed(path: string, cwd: string, config: SandboxConfig): boolean {
  const absolutePath = resolvePath(path, cwd);
  const denyRead = config.filesystem?.denyRead;

  if (!denyRead || denyRead.length === 0) {
    return true;
  }

  return !denyRead.some((pattern) => pathMatchesPattern(absolutePath, pattern));
}

export function pathMatchesPattern(path: string, pattern: string): boolean {
  // Expand ~ in pattern
  if (pattern.startsWith("~/")) {
    pattern = homedir() + pattern.slice(1);
  } else if (pattern === "~") {
    pattern = homedir();
  }

  // matchBase: patterns without / match against basename (e.g., *.pem matches /foo/bar.pem)
  // Check before adding {,/**} suffix which introduces /
  const useMatchBase = !pattern.includes("/");

  // For patterns without wildcards, also match children (e.g., /foo matches /foo/bar)
  if (!pattern.includes("*") && !pattern.includes("?")) {
    pattern = pattern + "{,/**}";
  }

  if (useMatchBase) {
    return picomatch.isMatch(path, pattern, { matchBase: true });
  } else {
    return picomatch.isMatch(path, pattern);
  }
}

function resolvePath(path: string, cwd: string): string {
  if (path.startsWith("~/")) {
    path = homedir() + path.slice(1);
  } else if (path === "~") {
    path = homedir();
  }

  if (!isAbsolute(path)) {
    path = resolve(cwd, path);
  }

  return path;
}
