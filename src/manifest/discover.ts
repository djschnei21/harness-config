import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import yaml from "js-yaml";
import { manifestSchema } from "./schema.ts";
import { isUrl, parseGitHubUrl } from "../util/fetch.ts";

export interface DiscoveredManifest {
  /** Display name from the manifest */
  name: string;
  /** Description from the manifest (if present) */
  description?: string;
  /** Path or URL to the manifest file */
  path: string;
}

/**
 * Check if a filename is a YAML file.
 */
function isYamlFilename(filename: string): boolean {
  return /\.ya?ml$/.test(filename);
}

/**
 * Discover all valid manifest files in a local directory.
 * Only scans the top-level directory (no recursion).
 */
export async function discoverManifestsInDir(dirPath: string): Promise<DiscoveredManifest[]> {
  const absoluteDir = resolve(dirPath);
  const manifests: DiscoveredManifest[] = [];

  let entries: string[];
  try {
    entries = await readdir(absoluteDir);
  } catch (err: any) {
    if (err.code === "ENOENT") {
      throw new Error(`Directory not found: ${absoluteDir}`);
    }
    throw new Error(`Cannot read directory: ${err.message}`);
  }

  const candidates = entries.filter(isYamlFilename);

  for (const filename of candidates) {
    const filePath = join(absoluteDir, filename);
    try {
      const content = await readFile(filePath, "utf-8");
      const raw = yaml.load(content);
      if (!raw || typeof raw !== "object") continue;

      const result = manifestSchema.safeParse(raw);
      if (result.success) {
        manifests.push({
          name: result.data.name,
          description: result.data.description,
          path: filePath,
        });
      }
    } catch {
      // Skip files that can't be parsed
    }
  }

  return manifests;
}

/**
 * Discover manifests in a GitHub repository directory.
 * Uses the GitHub Trees API to list files matching the manifest pattern.
 */
export async function discoverManifestsInGitHub(url: string): Promise<DiscoveredManifest[]> {
  const parsed = parseGitHubUrl(url);

  // Handle repo root: https://github.com/user/repo
  let user: string | undefined;
  let repo: string | undefined;
  let ref = "main";
  let treePath = "";

  if (parsed.type === "tree" && parsed.user && parsed.repo && parsed.ref) {
    user = parsed.user;
    repo = parsed.repo;
    ref = parsed.ref;
    treePath = parsed.path ?? "";
  } else {
    // Try to parse as repo root URL: https://github.com/user/repo
    const repoMatch = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/?$/);
    if (repoMatch) {
      user = repoMatch[1];
      repo = repoMatch[2];
    }
  }

  if (!user || !repo) {
    throw new Error(`Cannot discover manifests from URL: ${url}. Provide a GitHub repository or tree URL.`);
  }

  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "harness-config",
  };
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // List files via Trees API
  const apiUrl = `https://api.github.com/repos/${user}/${repo}/git/trees/${ref}?recursive=1`;
  const response = await fetch(apiUrl, { headers });
  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    tree: Array<{ path: string; type: string }>;
  };

  // Filter to manifest files in the target path
  const prefix = treePath ? `${treePath}/` : "";
  const candidates = data.tree.filter((entry) => {
    if (entry.type !== "blob") return false;
    const relativePath = prefix ? entry.path.slice(prefix.length) : entry.path;
    // Only top-level files in the target directory
    if (prefix && !entry.path.startsWith(prefix)) return false;
    if (relativePath.includes("/")) return false;
    return isYamlFilename(relativePath);
  });

  const manifests: DiscoveredManifest[] = [];

  for (const candidate of candidates) {
    const rawUrl = `https://raw.githubusercontent.com/${user}/${repo}/${ref}/${candidate.path}`;
    try {
      const response = await fetch(rawUrl, { headers: { "User-Agent": "harness-config" } });
      if (!response.ok) continue;
      const content = await response.text();
      const raw = yaml.load(content);
      if (!raw || typeof raw !== "object") continue;

      const result = manifestSchema.safeParse(raw);
      if (result.success) {
        const blobUrl = `https://github.com/${user}/${repo}/blob/${ref}/${candidate.path}`;
        manifests.push({
          name: result.data.name,
          description: result.data.description,
          path: blobUrl,
        });
      }
    } catch {
      // Skip files that can't be fetched/parsed
    }
  }

  return manifests;
}

/**
 * Check if a local path is a directory.
 */
export async function isDirectory(path: string): Promise<boolean> {
  try {
    const s = await stat(resolve(path));
    return s.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check if a URL points to a GitHub directory/repo (not a specific file).
 */
export function isGitHubDirUrl(url: string): boolean {
  const parsed = parseGitHubUrl(url);
  if (parsed.type === "tree") return true;
  // Repo root: https://github.com/user/repo
  return /^https:\/\/github\.com\/[^/]+\/[^/]+\/?$/.test(url);
}
