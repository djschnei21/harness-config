import { execSync } from "node:child_process";
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

/** Cache of binary detection results (per process). */
const detectionCache = new Map<string, boolean>();

/**
 * Check if a binary is available on the system PATH.
 * Results are cached for the lifetime of the process.
 */
export function isBinaryInstalled(binaryName: string): boolean {
  if (detectionCache.has(binaryName)) {
    return detectionCache.get(binaryName)!;
  }
  let found: boolean;
  try {
    execSync(`which ${binaryName}`, { stdio: "ignore" });
    found = true;
  } catch {
    found = false;
  }
  detectionCache.set(binaryName, found);
  return found;
}

/**
 * Detect if a harness is installed on the machine by checking for its binary.
 * Returns true if ANY of the adapter's binaryNames are found on PATH.
 */
export function isHarnessDetected(adapter: HarnessAdapter): boolean {
  return adapter.binaryNames.some((bin) => isBinaryInstalled(bin));
}

/**
 * Clear the detection cache (useful for testing).
 */
export function clearDetectionCache(): void {
  detectionCache.clear();
}

/**
 * Seed the detection cache with known values (useful for testing).
 */
export function seedDetectionCache(entries: Record<string, boolean>): void {
  for (const [key, value] of Object.entries(entries)) {
    detectionCache.set(key, value);
  }
}
