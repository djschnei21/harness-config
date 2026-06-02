import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, basename, join } from "node:path";
import type { HarnessAdapter, Scope } from "../harnesses/types.ts";
import type { HarnessName } from "../manifest/schema.ts";
import { rm } from "node:fs/promises";
import { isUrl, fetchFileContent } from "../util/fetch.ts";
import { isContentUnchanged } from "../util/json.ts";

/**
 * Agent frontmatter field support by harness.
 */
const FIELD_SUPPORT: Record<string, Record<HarnessName, boolean>> = {
  name: { claude: true, opencode: true, copilot: true, pi: true },
  description: { claude: true, opencode: true, copilot: true, pi: true },
  model: { claude: true, opencode: true, copilot: false, pi: false },
  temperature: { claude: true, opencode: true, copilot: false, pi: false },
  mode: { claude: false, opencode: true, copilot: false, pi: false },
  color: { claude: false, opencode: true, copilot: false, pi: false },
  tools: { claude: true, opencode: true, copilot: true, pi: false },
  permission: { claude: false, opencode: true, copilot: false, pi: false },
};

/**
 * Named color → hex map for OpenCode.
 */
const COLOR_MAP: Record<string, string> = {
  red: "#FF0000",
  green: "#00FF00",
  blue: "#0000FF",
  yellow: "#FFFF00",
  orange: "#FF8C00",
  cyan: "#00FFFF",
  purple: "#800080",
  magenta: "#FF00FF",
  white: "#FFFFFF",
  black: "#000000",
  pink: "#FFC0CB",
  gray: "#808080",
};

/**
 * Parse YAML-style frontmatter from a markdown file.
 */
export function parseFrontmatter(content: string): {
  frontmatter: Record<string, string>;
  body: string;
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const frontmatter: Record<string, string> = {};
  const lines = match[1].split(/\r?\n/);
  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, "");
      frontmatter[key] = value;
    }
  }

  return { frontmatter, body: match[2] };
}

/**
 * Serialize frontmatter + body back to markdown.
 */
function serializeFrontmatter(frontmatter: Record<string, string>, body: string): string {
  if (Object.keys(frontmatter).length === 0) {
    return body;
  }
  const lines = Object.entries(frontmatter).map(([k, v]) => `${k}: ${v}`);
  return `---\n${lines.join("\n")}\n---\n${body}`;
}

/**
 * Transform tools field for OpenCode.
 * "Read, Write, Edit" → "tools:\n  read: true\n  write: true\n  edit: true"
 */
function transformToolsForOpencode(toolsValue: string): string {
  const tools = toolsValue.split(",").map((t) => t.trim().toLowerCase());
  const yamlLines = tools.map((t) => `  ${t}: true`);
  return `\ntools:\n${yamlLines.join("\n")}`;
}

/**
 * Apply per-harness transforms to agent frontmatter.
 */
export function transformAgentFrontmatter(
  frontmatter: Record<string, string>,
  harnessName: HarnessName,
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(frontmatter)) {
    const support = FIELD_SUPPORT[key];
    if (!support || !support[harnessName]) {
      continue; // Strip unsupported field
    }

    // Apply transforms
    if (key === "color" && harnessName === "opencode") {
      const hex = COLOR_MAP[value.toLowerCase()];
      result[key] = hex ?? value;
    } else if (key === "tools" && harnessName === "opencode") {
      // Tools conversion is handled specially in serialization
      // For now, store the transformed value
      const tools = value.split(",").map((t) => t.trim().toLowerCase());
      // OpenCode wants YAML map format — we'll handle this in serialization
      result[key] = value; // Keep original for now, transform at serialization
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Serialize an agent markdown file with transforms applied for a specific harness.
 */
export function transformAgentContent(content: string, harnessName: HarnessName): string {
  const { frontmatter, body } = parseFrontmatter(content);
  const transformed = transformAgentFrontmatter(frontmatter, harnessName);

  // Special handling for OpenCode tools field
  if (harnessName === "opencode" && transformed.tools) {
    const toolsValue = transformed.tools;
    delete transformed.tools;
    const serialized = serializeFrontmatter(transformed, body);
    // Inject tools as YAML map in frontmatter
    if (Object.keys(transformed).length > 0) {
      // Insert tools map before the closing ---
      const tools = toolsValue.split(",").map((t) => t.trim().toLowerCase());
      const toolsYaml = tools.map((t) => `  ${t}: true`).join("\n");
      return serialized.replace(
        /\n---\n/,
        `\ntools:\n${toolsYaml}\n---\n`,
      );
    }
    // No other frontmatter, create fresh
    const tools = toolsValue.split(",").map((t) => t.trim().toLowerCase());
    const toolsYaml = tools.map((t) => `  ${t}: true`).join("\n");
    return `---\ntools:\n${toolsYaml}\n---\n${body}`;
  }

  return serializeFrontmatter(transformed, body);
}

/**
 * Install an agent to a harness.
 * sourceDir: where to find the agent file (manifest location, may be a URL base)
 * destCwd: where to write output (working directory)
 */
export async function addAgent(
  adapter: HarnessAdapter,
  agentPath: string,
  scope: Scope,
  sourceDir: string,
  destCwd: string,
): Promise<{ installed: string; unchanged?: boolean } | { skipped: string; reason: string }> {
  const agentDir = adapter.agentDir(scope);
  if (!agentDir) {
    return { skipped: agentPath, reason: `${adapter.displayName} does not support agents` };
  }

  // Resolve the agent content — from URL or local path
  let content: string;
  if (isUrl(agentPath)) {
    content = await fetchFileContent(agentPath);
  } else if (isUrl(sourceDir)) {
    // Relative path against a URL base → construct full URL
    const fullUrl = `${sourceDir}/${agentPath.replace(/^\.\//,  "")}`.replace(/\/tree\//, "/blob/");
    content = await fetchFileContent(fullUrl);
  } else {
    const absoluteAgentPath = resolve(sourceDir, agentPath);
    content = await readFile(absoluteAgentPath, "utf-8");
  }

  const filename = basename(agentPath);
  const destDir = resolve(destCwd, agentDir);
  const destPath = join(destDir, filename);

  // Skip write if content is identical (idempotent)
  if (await isContentUnchanged(destPath, content)) {
    return { installed: destPath, unchanged: true };
  }

  await mkdir(destDir, { recursive: true });
  await writeFile(destPath, content, "utf-8");

  return { installed: destPath };
}

/**
 * Remove an agent from a harness.
 */
export async function removeAgent(
  adapter: HarnessAdapter,
  agentName: string,
  scope: Scope,
  cwd: string,
): Promise<{ removed: string } | { skipped: string; reason: string }> {
  const agentDir = adapter.agentDir(scope);
  if (!agentDir) {
    return { skipped: agentName, reason: `${adapter.displayName} does not support agents` };
  }

  const filename = agentName.endsWith(".md") ? agentName : `${agentName}.md`;
  const destPath = resolve(cwd, agentDir, filename);

  try {
    await rm(destPath);
    return { removed: destPath };
  } catch (err: any) {
    if (err.code === "ENOENT") {
      return { skipped: agentName, reason: "File not found" };
    }
    throw err;
  }
}
