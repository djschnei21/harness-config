import yaml from "js-yaml";

/**
 * Parse a markdown file into frontmatter object + body string.
 * Handles YAML frontmatter delimited by `---`.
 */
export function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  // Match frontmatter with content between delimiters, or empty frontmatter
  const match = content.match(/^---\r?\n((?:[\s\S]*?\r?\n)?)---(?:\r?\n)?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const rawFrontmatter = match[1].trim();
  let frontmatter: Record<string, unknown>;

  if (!rawFrontmatter) {
    frontmatter = {};
  } else {
    try {
      const parsed = yaml.load(rawFrontmatter);
      frontmatter = (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        ? parsed as Record<string, unknown>
        : {};
    } catch {
      frontmatter = {};
    }
  }

  return { frontmatter, body: match[2] ?? "" };
}

/**
 * Serialize frontmatter + body back to a markdown string.
 */
export function serializeFrontmatter(frontmatter: Record<string, unknown>, body: string): string {
  if (Object.keys(frontmatter).length === 0) {
    return body;
  }
  const yamlStr = yaml.dump(frontmatter, {
    lineWidth: -1, // Don't wrap lines
    noRefs: true,
    sortKeys: false,
  }).trimEnd();
  return `---\n${yamlStr}\n---\n${body}`;
}

/**
 * Merge overrides into a markdown file's frontmatter.
 *
 * Rules:
 * - Shallow merge: override keys added/overwrite source frontmatter
 * - Null deletes: override key with null value removes that key
 * - Body never overridden: body always from source
 *
 * Returns the reassembled markdown string.
 */
export function mergeAgentOverrides(
  sourceContent: string,
  overrides: Record<string, unknown>,
): string {
  const { frontmatter, body } = parseFrontmatter(sourceContent);

  // Shallow merge with null-deletion
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) {
      delete frontmatter[key];
    } else {
      frontmatter[key] = value;
    }
  }

  return serializeFrontmatter(frontmatter, body);
}
