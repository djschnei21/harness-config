import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import yaml from "js-yaml";
import {
  manifestSchema,
  type ManifestConfig,
  type NormalizedManifest,
  type HarnessName,
  type HarnessConfig,
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

  return {
    name: config.name,
    description: config.description,
    harnesses,
    mcps: config.mcps ?? {},
    skills: config.skills ?? [],
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
