import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { HarnessName } from "../manifest/schema.ts";
import type { HarnessAdapter } from "./types.ts";
import { claude } from "./claude.ts";
import { opencode } from "./opencode.ts";
import { copilot } from "./copilot.ts";
import { pi } from "./pi.ts";

export { type HarnessAdapter, type Scope } from "./types.ts";
export { parseStdioCommand, resolveEnvItems, buildHeaders, hasKeychainEnvRefs, isStdio } from "./mcp-util.ts";

const registry: Record<HarnessName, HarnessAdapter> = {
  claude,
  opencode,
  copilot,
  pi,
};

/**
 * Get the adapter for a harness by name.
 */
export function getHarness(name: HarnessName): HarnessAdapter {
  return registry[name];
}

/**
 * Get all registered harness adapters.
 */
export function getAllHarnesses(): HarnessAdapter[] {
  return Object.values(registry);
}

/**
 * Get adapters for a list of harness names.
 */
export function getHarnesses(names: HarnessName[]): HarnessAdapter[] {
  return names.map((n) => registry[n]);
}

/**
 * Detect if a harness has existing config on disk.
 * Checks MCP config and config root directory.
 */
export function isHarnessDetected(adapter: HarnessAdapter, scope: "project" | "global", cwd: string): boolean {
  const paths = adapter.detectPaths(scope);
  return paths.some((p) => existsSync(resolve(cwd, p)));
}
