import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { platform } from "node:os";
import type { McpDef, EnvItem } from "../manifest/schema.ts";

const execFileAsync = promisify(execFile);

export class KeychainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KeychainError";
  }
}

/**
 * Check if we're on macOS (only platform where keychain is supported).
 */
export function isKeychainSupported(): boolean {
  return platform() === "darwin";
}

/**
 * Validate that a keychain item exists.
 * Returns true if found, false if not.
 */
export async function validateKeychainItem(service: string): Promise<boolean> {
  if (!isKeychainSupported()) {
    throw new KeychainError("Keychain resolution is only supported on macOS");
  }

  try {
    await execFileAsync("security", [
      "find-generic-password",
      "-s",
      service,
      "-w",
    ]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract all keychain references from an MCP definition.
 * Returns a map of env var name → keychain service name.
 */
export function extractKeychainRefs(def: McpDef): Record<string, string> {
  const refs: Record<string, string> = {};

  if (def.env) {
    for (const item of def.env) {
      if (typeof item !== "string") {
        for (const [key, value] of Object.entries(item)) {
          if (value.startsWith("keychain:")) {
            refs[key] = value.slice(9); // Remove "keychain:" prefix
          }
        }
      }
    }
  }

  return refs;
}

/**
 * Extract keychain reference from auth field.
 */
export function extractAuthKeychainRef(auth?: string): string | null {
  if (!auth) return null;
  if (auth.startsWith("keychain:")) {
    return auth.slice(9);
  }
  return null;
}

/**
 * Extract keychain references from headers.
 */
export function extractHeaderKeychainRefs(
  headers?: Record<string, string>,
): Record<string, string> {
  if (!headers) return {};
  const refs: Record<string, string> = {};
  for (const [header, value] of Object.entries(headers)) {
    if (value.startsWith("keychain:")) {
      refs[header] = value.slice(9);
    }
  }
  return refs;
}

/**
 * Check if an MCP definition requires a keychain wrapper.
 * Only stdio servers with keychain env refs need wrappers.
 */
export function needsKeychainWrapper(def: McpDef): boolean {
  if (!("stdio" in def) || !def.stdio) return false;
  const refs = extractKeychainRefs(def);
  return Object.keys(refs).length > 0;
}

/**
 * A missing keychain item with context for display.
 */
export interface MissingKeychainItem {
  mcpName: string;
  service: string;
  context: string; // e.g. "env FIRECRAWL_API_KEY", "auth", "header Authorization"
}

/**
 * Validate all keychain references in a manifest's MCPs.
 * Returns structured missing items for rich display.
 */
export async function validateKeychainRefsStructured(
  mcps: Record<string, McpDef>,
): Promise<{ missing: MissingKeychainItem[]; platformWarning?: string }> {
  if (!isKeychainSupported()) {
    const hasRefs = Object.values(mcps).some((def) => {
      const envRefs = extractKeychainRefs(def);
      const authRef = "auth" in def ? extractAuthKeychainRef(def.auth) : null;
      const headerRefs = "headers" in def ? extractHeaderKeychainRefs(def.headers) : {};
      return (
        Object.keys(envRefs).length > 0 ||
        authRef !== null ||
        Object.keys(headerRefs).length > 0
      );
    });
    if (hasRefs) {
      return { missing: [], platformWarning: "Keychain references found but current platform is not macOS \u2014 they will not be resolved" };
    }
    return { missing: [] };
  }

  const missing: MissingKeychainItem[] = [];
  for (const [name, def] of Object.entries(mcps)) {
    const envRefs = extractKeychainRefs(def);
    for (const [varName, service] of Object.entries(envRefs)) {
      const exists = await validateKeychainItem(service);
      if (!exists) {
        missing.push({ mcpName: name, service, context: `env ${varName}` });
      }
    }

    if ("auth" in def && def.auth) {
      const authService = extractAuthKeychainRef(def.auth);
      if (authService) {
        const exists = await validateKeychainItem(authService);
        if (!exists) {
          missing.push({ mcpName: name, service: authService, context: "auth" });
        }
      }
    }

    if ("headers" in def && def.headers) {
      const headerRefs = extractHeaderKeychainRefs(def.headers);
      for (const [header, service] of Object.entries(headerRefs)) {
        const exists = await validateKeychainItem(service);
        if (!exists) {
          missing.push({ mcpName: name, service, context: `header ${header}` });
        }
      }
    }
  }

  return { missing };
}

/**
 * Validate all keychain references in a manifest's MCPs.
 * Returns warnings for missing items.
 */
export async function validateKeychainRefs(
  mcps: Record<string, McpDef>,
): Promise<string[]> {
  if (!isKeychainSupported()) {
    // Check if any keychain refs exist
    const hasRefs = Object.values(mcps).some((def) => {
      const envRefs = extractKeychainRefs(def);
      const authRef = "auth" in def ? extractAuthKeychainRef(def.auth) : null;
      const headerRefs = "headers" in def ? extractHeaderKeychainRefs(def.headers) : {};
      return (
        Object.keys(envRefs).length > 0 ||
        authRef !== null ||
        Object.keys(headerRefs).length > 0
      );
    });
    if (hasRefs) {
      return ["Keychain references found but current platform is not macOS — they will not be resolved"];
    }
    return [];
  }

  const warnings: string[] = [];
  for (const [name, def] of Object.entries(mcps)) {
    const envRefs = extractKeychainRefs(def);
    for (const [varName, service] of Object.entries(envRefs)) {
      const exists = await validateKeychainItem(service);
      if (!exists) {
        warnings.push(`MCP "${name}": keychain item "${service}" not found (env ${varName})`);
      }
    }

    if ("auth" in def && def.auth) {
      const authService = extractAuthKeychainRef(def.auth);
      if (authService) {
        const exists = await validateKeychainItem(authService);
        if (!exists) {
          warnings.push(`MCP "${name}": keychain item "${authService}" not found (auth)`);
        }
      }
    }

    if ("headers" in def && def.headers) {
      const headerRefs = extractHeaderKeychainRefs(def.headers);
      for (const [header, service] of Object.entries(headerRefs)) {
        const exists = await validateKeychainItem(service);
        if (!exists) {
          warnings.push(`MCP "${name}": keychain item "${service}" not found (header ${header})`);
        }
      }
    }
  }

  return warnings;
}
