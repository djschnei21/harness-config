import { cp, rm, mkdir, readFile, stat } from "node:fs/promises";
import { resolve, basename, join } from "node:path";
import type { HarnessAdapter, Scope } from "../harnesses/types.ts";
import { isUrl, fetchDirectoryToTemp } from "../util/fetch.ts";
import { isContentUnchanged } from "../util/json.ts";

/**
 * Sanitize a name to kebab-case for use as directory name.
 */
export function toKebabCase(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Derive the installed skill directory name.
 * 1. Check SKILL.md frontmatter for `name` field
 * 2. Fall back to directory basename
 * Sanitized to kebab-case.
 */
export async function deriveSkillName(absoluteSkillPath: string, originalPath: string): Promise<string> {
  // Try to read SKILL.md frontmatter for name
  try {
    const skillMdPath = join(absoluteSkillPath, "SKILL.md");
    const content = await readFile(skillMdPath, "utf-8");
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (match) {
      const nameMatch = match[1].match(/^name:\s*(.+)$/m);
      if (nameMatch) {
        const name = nameMatch[1].trim().replace(/^["']|["']$/g, "");
        if (name) return toKebabCase(name);
      }
    }
  } catch {
    // SKILL.md doesn't exist or can't be read — fall back
  }

  // Fall back to directory basename
  return toKebabCase(basename(originalPath));
}

/**
 * Install a skill directory to a harness.
 * sourceDir: where to find the skill (manifest location, may be a URL base)
 * destCwd: where to write output (working directory)
 */
export async function addSkill(
  adapter: HarnessAdapter,
  skillPath: string,
  scope: Scope,
  sourceDir: string,
  destCwd: string,
): Promise<{ installed: string; unchanged?: boolean }> {
  let absoluteSkillPath: string;

  if (isUrl(skillPath)) {
    // Direct URL to a skill directory
    absoluteSkillPath = await fetchDirectoryToTemp(skillPath);
  } else if (isUrl(sourceDir)) {
    // Relative path against a URL base → construct GitHub tree URL
    const fullUrl = sourceDir.includes("/tree/")
      ? `${sourceDir}/${skillPath}`
      : `${sourceDir}/tree/main/${skillPath}`;
    absoluteSkillPath = await fetchDirectoryToTemp(fullUrl);
  } else {
    absoluteSkillPath = resolve(sourceDir, skillPath);
  }

  const skillName = await deriveSkillName(absoluteSkillPath, skillPath);
  const destDir = resolve(destCwd, adapter.skillDir(scope));
  const destPath = join(destDir, skillName);

  // Check if SKILL.md is unchanged as a proxy for the whole directory
  try {
    const sourceSkillMd = await readFile(join(absoluteSkillPath, "SKILL.md"), "utf-8");
    if (await isContentUnchanged(join(destPath, "SKILL.md"), sourceSkillMd)) {
      return { installed: destPath, unchanged: true };
    }
  } catch {
    // SKILL.md doesn't exist or dest doesn't exist — proceed with copy
  }

  await mkdir(destDir, { recursive: true });
  await cp(absoluteSkillPath, destPath, { recursive: true, force: true });

  return { installed: destPath };
}

/**
 * Remove a skill directory from a harness.
 */
export async function removeSkill(
  adapter: HarnessAdapter,
  skillName: string,
  scope: Scope,
  cwd: string,
): Promise<{ removed: string } | { skipped: string; reason: string }> {
  const sanitizedName = toKebabCase(skillName);
  const destPath = resolve(cwd, adapter.skillDir(scope), sanitizedName);

  try {
    await rm(destPath, { recursive: true });
    return { removed: destPath };
  } catch (err: any) {
    if (err.code === "ENOENT") {
      return { skipped: skillName, reason: "Directory not found" };
    }
    throw err;
  }
}
