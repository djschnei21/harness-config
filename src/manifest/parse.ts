import { readFile } from "node:fs/promises";
import { resolve, dirname, basename } from "node:path";
import yaml from "js-yaml";
import {
  manifestSchema,
  type ManifestConfig,
  type NormalizedManifest,
  type HarnessName,
  type HarnessConfig,
  type UniversalAgent,
  harnessNames,
} from "./schema.ts";
import { isUrl, fetchFileContent, parseGitHubUrl } from "../util/fetch.ts";

export class ManifestParseError extends Error {
  constructor(
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ManifestParseError";
  }
}

/**
 * Parse a manifest from a file path or URL.
 */
export async function parseManifestFile(filePath: string): Promise<NormalizedManifest> {
  if (isUrl(filePath)) {
    return parseManifestUrl(filePath);
  }

  const absolutePath = resolve(filePath);
  let content: string;

  try {
    content = await readFile(absolutePath, "utf-8");
  } catch (err: any) {
    if (err.code === "ENOENT") {
      throw new ManifestParseError(`Manifest file not found: ${absolutePath}`);
    }
    throw new ManifestParseError(`Failed to read manifest: ${err.message}`);
  }

  const manifest = parseManifestYaml(content);
  manifest.baseDir = dirname(absolutePath);
  return manifest;
}

/**
 * Parse a manifest from a URL.
 * baseDir is set to the URL's directory (for resolving relative URL paths).
 */
async function parseManifestUrl(url: string): Promise<NormalizedManifest> {
  let content: string;

  try {
    content = await fetchFileContent(url);
  } catch (err: any) {
    throw new ManifestParseError(`Failed to fetch manifest from URL: ${err.message}`);
  }

  const manifest = parseManifestYaml(content);

  // For GitHub URLs, derive the base URL for relative path resolution
  const parsed = parseGitHubUrl(url);
  if (parsed.type === "blob" && parsed.user && parsed.repo && parsed.ref && parsed.path) {
    const pathDir = parsed.path.includes("/")
      ? parsed.path.slice(0, parsed.path.lastIndexOf("/"))
      : "";
    manifest.baseDir = `https://github.com/${parsed.user}/${parsed.repo}/tree/${parsed.ref}${pathDir ? "/" + pathDir : ""}`;
  } else {
    // For non-GitHub URLs, use the URL directory as base
    const urlDir = url.slice(0, url.lastIndexOf("/"));
    manifest.baseDir = urlDir;
  }

  return manifest;
}

/**
 * Parse a manifest from a YAML string.
 */
export function parseManifestYaml(content: string): NormalizedManifest {
  let raw: unknown;

  try {
    raw = yaml.load(content);
  } catch (err: any) {
    throw new ManifestParseError(`Invalid YAML: ${err.message}`);
  }

  if (!raw || typeof raw !== "object") {
    throw new ManifestParseError("Manifest must be a YAML object");
  }

  const result = manifestSchema.safeParse(raw);
  if (!result.success) {
    throw new ManifestParseError("Invalid manifest schema", result.error.format());
  }

  return normalizeManifest(result.data);
}

/**
 * Normalize the parsed manifest into a consistent internal form.
 */
export function normalizeManifest(config: ManifestConfig): NormalizedManifest {
  const harnesses = normalizeHarnesses(config.harnesses);
  const agents = normalizeUniversalAgents(config.agents);

  // Conflict detection: universal agent vs harness-specific agent with same basename
  detectAgentConflicts(agents, harnesses);

  return {
    name: config.name,
    description: config.description,
    harnesses,
    mcps: config.mcps ?? {},
    skills: config.skills ?? [],
    agents,
  };
}

/**
 * Normalize the harnesses field into a Map<HarnessName, HarnessConfig | null>.
 */
function normalizeHarnesses(
  field: ManifestConfig["harnesses"],
): Map<HarnessName, HarnessConfig | null> {
  const map = new Map<HarnessName, HarnessConfig | null>();

  if (Array.isArray(field)) {
    // Simple array form: ["claude", "opencode", ...]
    for (const name of field) {
      map.set(name as HarnessName, null);
    }
  } else {
    // Map form: { claude: { ... }, opencode: null, ... }
    for (const [name, config] of Object.entries(field)) {
      if (harnessNames.includes(name as HarnessName)) {
        map.set(name as HarnessName, config ?? null);
      }
    }
  }

  return map;
}

/**
 * Resolve default manifest path — looks for harness-config.yaml in cwd.
 */
export function getDefaultManifestPath(): string {
  return resolve("harness-config.yaml");
}

/**
 * Normalize the top-level agents field into UniversalAgent[].
 */
function normalizeUniversalAgents(agents?: unknown[]): UniversalAgent[] {
  if (!agents || agents.length === 0) return [];

  return agents.map((entry) => {
    if (typeof entry === "string") {
      return { source: entry, overrides: new Map() };
    }

    // Object form: { source: "./path", claude: {...}, pi: {...} }
    const obj = entry as Record<string, unknown>;
    const source = obj.source as string;
    const overrides = new Map<HarnessName, Record<string, unknown>>();

    for (const [key, value] of Object.entries(obj)) {
      if (key === "source") continue;
      if (harnessNames.includes(key as HarnessName) && value && typeof value === "object") {
        overrides.set(key as HarnessName, value as Record<string, unknown>);
      }
    }

    return { source, overrides };
  });
}

/**
 * Detect conflicts between universal agents and harness-specific agents.
 * Throws ManifestParseError if a universal agent and a harness-specific agent
 * would install to the same destination file.
 */
function detectAgentConflicts(
  universalAgents: UniversalAgent[],
  harnesses: Map<HarnessName, HarnessConfig | null>,
): void {
  if (universalAgents.length === 0) return;

  // Build a set of universal agent basenames
  const universalBasenames = new Map<string, string>();
  for (const agent of universalAgents) {
    const name = basename(agent.source);
    universalBasenames.set(name, agent.source);
  }

  // Check each harness-specific agents list for conflicts
  for (const [harnessName, config] of harnesses) {
    if (!config?.agents) continue;
    for (const agentPath of config.agents) {
      const agentBasename = basename(agentPath);
      const universalSource = universalBasenames.get(agentBasename);
      if (universalSource) {
        throw new ManifestParseError(
          `Conflict: universal agent "${agentBasename}" (from "${universalSource}") and ` +
          `harness-specific agent "${agentPath}" under "${harnessName}" would both install to the same destination.`,
        );
      }
    }
  }
}
