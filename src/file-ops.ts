import { homedir } from "node:os";
import { basename } from "node:path";
import { isAbsolute, resolve } from "node:path";

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

function pathMatchesPattern(path: string, pattern: string): boolean {
  // Expand ~ in pattern
  if (pattern.startsWith("~/")) {
    pattern = homedir() + pattern.slice(1);
  } else if (pattern === "~") {
    pattern = homedir();
  }

  // If pattern has no path separator, match against basename only
  if (!pattern.includes("/")) {
    return globMatch(basename(path), pattern);
  }

  // Directory prefix match (pattern without wildcards)
  if (!pattern.includes("*") && !pattern.includes("?")) {
    return path === pattern || path.startsWith(pattern + "/");
  }

  // Full path glob match
  return globMatch(path, pattern);
}

/**
 * Matches a string against a glob pattern.
 * Supports: * (any chars except /), ** (any chars including /), ? (single char except /)
 */
function globMatch(str: string, pattern: string): boolean {
  let regexStr = "^";
  let i = 0;

  while (i < pattern.length) {
    const char = pattern[i];

    if (char === "*" && pattern[i + 1] === "*") {
      // ** matches anything including /
      if (pattern[i + 2] === "/") {
        // **/ at this position - match any path prefix (including empty)
        regexStr += "(?:.*/)?";
        i += 3;
      } else {
        // ** at end or before non-slash - match anything
        regexStr += ".*";
        i += 2;
      }
    } else if (char === "*") {
      // * matches anything except /
      regexStr += "[^/]*";
      i++;
    } else if (char === "?") {
      // ? matches single char except /
      regexStr += "[^/]";
      i++;
    } else if (".+^${}()|[]\\".includes(char)) {
      // Escape regex special chars
      regexStr += "\\" + char;
      i++;
    } else {
      regexStr += char;
      i++;
    }
  }

  regexStr += "$";

  try {
    return new RegExp(regexStr).test(str);
  } catch {
    return str === pattern;
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
