import { resolve } from "node:path";
import type { HarnessAdapter, Scope } from "../harnesses/types.ts";
import type { McpDef, NormalizedManifest } from "../manifest/schema.ts";
import { readJsonFile, writeJsonFile, mergeMcpEntries, removeMcpEntries } from "../util/json.ts";

export interface McpAddResult {
  harness: string;
  servers: string[];
  configPath: string;
}

export interface McpRmResult {
  harness: string;
  removed: string[];
  configPath: string;
}

/**
 * Install MCP servers to a harness config.
 * Additive: merges into existing config, overwrites matching entries.
 */
export async function addMcps(
  adapter: HarnessAdapter,
  mcps: Record<string, McpDef>,
  scope: Scope,
  wrapperPaths: Record<string, string>,
  cwd: string,
): Promise<McpAddResult> {
  const configPath = resolve(cwd, adapter.mcpConfigPath(scope));

  // Translate each MCP to harness-native format
  const entries: Record<string, unknown> = {};
  for (const [name, def] of Object.entries(mcps)) {
    const wrapperPath = wrapperPaths[name];
    entries[name] = adapter.translateMcp(name, def, wrapperPath);
  }

  // Read existing, merge, write
  const existing = await readJsonFile(configPath);
  const merged = mergeMcpEntries(existing, adapter.mcpJsonKey, entries);
  await writeJsonFile(configPath, merged);

  return {
    harness: adapter.displayName,
    servers: Object.keys(mcps),
    configPath,
  };
}

/**
 * Remove MCP servers from a harness config by name.
 */
export async function removeMcps(
  adapter: HarnessAdapter,
  names: string[],
  scope: Scope,
  cwd: string,
): Promise<McpRmResult> {
  const configPath = resolve(cwd, adapter.mcpConfigPath(scope));

  const existing = await readJsonFile(configPath);
  const updated = removeMcpEntries(existing, adapter.mcpJsonKey, names);
  await writeJsonFile(configPath, updated);

  return {
    harness: adapter.displayName,
    removed: names,
    configPath,
  };
}
