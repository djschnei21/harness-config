import { cp, rm, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import type { HarnessAdapter, Scope } from "../harnesses/types.ts";
import type { FileMapping } from "../manifest/schema.ts";
import { isUrl, fetchFileContent } from "../util/fetch.ts";
import { isContentUnchanged } from "../util/json.ts";

/**
 * Install a file mapping (escape hatch) to a harness.
 * sourceDir: where to find source files (manifest location, may be a URL base)
 * destCwd: where to write output (working directory)
 */
export async function addFile(
  adapter: HarnessAdapter,
  mapping: FileMapping,
  scope: Scope,
  sourceDir: string,
  destCwd: string,
): Promise<{ installed: string; unchanged?: boolean }> {
  const configRoot = resolve(destCwd, adapter.configRoot(scope));
  const destPath = join(configRoot, mapping.dest);
  await mkdir(dirname(destPath), { recursive: true });

  let content: string;

  if (isUrl(mapping.source)) {
    // Fetch from URL directly
    content = await fetchFileContent(mapping.source);
  } else if (isUrl(sourceDir)) {
    // Relative path against a URL base
    const fullUrl = `${sourceDir}/${mapping.source}`.replace(/\/tree\//, "/blob/");
    content = await fetchFileContent(fullUrl);
  } else {
    // Local path
    const sourcePath = resolve(sourceDir, mapping.source);
    content = await readFile(sourcePath, "utf-8");
  }

  // Skip write if content is identical (idempotent)
  if (await isContentUnchanged(destPath, content)) {
    return { installed: destPath, unchanged: true };
  }

  await writeFile(destPath, content, "utf-8");
  return { installed: destPath };
}

/**
 * Remove a file mapping from a harness.
 */
export async function removeFile(
  adapter: HarnessAdapter,
  mapping: FileMapping,
  scope: Scope,
  cwd: string,
): Promise<{ removed: string } | { skipped: string; reason: string }> {
  const configRoot = resolve(cwd, adapter.configRoot(scope));
  const destPath = join(configRoot, mapping.dest);

  try {
    await rm(destPath, { recursive: true });
    return { removed: destPath };
  } catch (err: any) {
    if (err.code === "ENOENT") {
      return { skipped: mapping.dest, reason: "File not found" };
    }
    throw err;
  }
}
