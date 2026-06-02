import { homedir } from "node:os";
import { resolve, join } from "node:path";
import type { McpDef, EnvItem } from "../manifest/schema.ts";
import type { McpJsonEntry } from "./types.ts";

/**
 * Parse a stdio command string into command + args.
 */
export function parseStdioCommand(stdio: string | string[]): { command: string; args: string[] } {
  if (Array.isArray(stdio)) {
    return { command: stdio[0], args: stdio.slice(1) };
  }
  const parts = stdio.split(/\s+/);
  return { command: parts[0], args: parts.slice(1) };
}

/**
 * Resolve env items into the JSON env format used by most harnesses.
 * Bare string → passthrough (${env:VAR})
 * Keychain refs are handled separately via wrapper scripts.
 */
export function resolveEnvItems(envItems: EnvItem[] | undefined): Record<string, string> | undefined {
  if (!envItems || envItems.length === 0) return undefined;

  const env: Record<string, string> = {};
  for (const item of envItems) {
    if (typeof item === "string") {
      env[item] = `\${env:${item}}`;
    } else {
      // Key-value pair — always keychain: (validated by schema)
      // Keychain vars are set by the wrapper script, just pass through the name
      for (const [key] of Object.entries(item)) {
        env[key] = `\${env:${key}}`;
      }
    }
  }
  return env;
}

/**
 * Resolve auth/headers value references.
 * "env:VAR" → "${env:VAR}"
 * "keychain:service" → will be validated but stored as literal for wrappers to handle
 */
export function resolveValueRef(ref: string): string {
  if (ref.startsWith("env:")) {
    const varName = ref.slice(4);
    return `\${env:${varName}}`;
  }
  if (ref.startsWith("keychain:")) {
    // For HTTP endpoints, keychain values are resolved at sync time
    // This is a placeholder — actual resolution happens in keychain/resolve.ts
    return `__keychain:${ref.slice(9)}__`;
  }
  return ref;
}

/**
 * Build headers object from auth + headers fields.
 */
export function buildHeaders(
  auth?: string,
  headers?: Record<string, string>,
): Record<string, string> | undefined {
  const result: Record<string, string> = {};

  if (auth) {
    result["Authorization"] = `Bearer ${resolveValueRef(auth)}`;
  }

  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      result[key] = resolveValueRef(value);
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Check if an MCP definition has keychain references in its env items.
 */
export function hasKeychainEnvRefs(envItems: EnvItem[] | undefined): boolean {
  if (!envItems) return false;
  return envItems.some(
    (item) =>
      typeof item !== "string" &&
      Object.values(item).some((v) => v.startsWith("keychain:")),
  );
}

/**
 * Check if an MCP definition is stdio transport.
 */
export function isStdio(def: McpDef): def is McpDef & { stdio: string | string[] } {
  return "stdio" in def && def.stdio !== undefined;
}

/**
 * Resolve a path that may contain ~ to absolute.
 */
export function expandHome(p: string): string {
  if (p.startsWith("~/")) {
    return join(homedir(), p.slice(2));
  }
  return p;
}
