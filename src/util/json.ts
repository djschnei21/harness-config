import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Check if a file's current content matches new content.
 * Returns true if the file exists and content is identical.
 */
export async function isContentUnchanged(filePath: string, newContent: string): Promise<boolean> {
  try {
    const existing = await readFile(filePath, "utf-8");
    return existing === newContent;
  } catch {
    return false;
  }
}

/**
 * Safely read a JSON file. Returns empty object if file doesn't exist.
 */
export async function readJsonFile(filePath: string): Promise<Record<string, unknown>> {
  try {
    const content = await readFile(filePath, "utf-8");
    return JSON.parse(content);
  } catch (err: any) {
    if (err.code === "ENOENT") {
      return {};
    }
    if (err instanceof SyntaxError) {
      throw new Error(`Invalid JSON in ${filePath}: ${err.message}`);
    }
    throw err;
  }
}

/**
 * Write a JSON file, creating parent directories as needed.
 * Preserves 2-space indentation with trailing newline.
 */
export async function writeJsonFile(
  filePath: string,
  data: Record<string, unknown>,
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

/**
 * Merge MCP entries into an existing JSON config (additive).
 * Existing entries with the same name are overwritten.
 * Other entries are preserved.
 */
export function mergeMcpEntries(
  existing: Record<string, unknown>,
  mcpJsonKey: string,
  entries: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...existing };
  const existingServers = (result[mcpJsonKey] as Record<string, unknown>) ?? {};
  result[mcpJsonKey] = { ...existingServers, ...entries };
  return result;
}

/**
 * Remove MCP entries from an existing JSON config by name.
 */
export function removeMcpEntries(
  existing: Record<string, unknown>,
  mcpJsonKey: string,
  names: string[],
): Record<string, unknown> {
  const result = { ...existing };
  const existingServers = { ...((result[mcpJsonKey] as Record<string, unknown>) ?? {}) };
  for (const name of names) {
    delete existingServers[name];
  }
  result[mcpJsonKey] = existingServers;
  return result;
}
