import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename, dirname } from "node:path";

/**
 * Check if a string is a URL (starts with http:// or https://).
 */
export function isUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

/**
 * Convert a GitHub blob/tree URL to a raw content URL.
 * 
 * Examples:
 *   https://github.com/user/repo/blob/main/path/to/file.md
 *   → https://raw.githubusercontent.com/user/repo/main/path/to/file.md
 *
 *   https://github.com/user/repo/tree/main/path/to/dir
 *   → { user, repo, ref: "main", path: "path/to/dir" }
 */
export function parseGitHubUrl(url: string): {
  type: "blob" | "tree" | "raw" | "other";
  rawUrl?: string;
  user?: string;
  repo?: string;
  ref?: string;
  path?: string;
} {
  // Already a raw URL
  if (url.startsWith("https://raw.githubusercontent.com/")) {
    return { type: "raw", rawUrl: url };
  }

  const match = url.match(
    /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(blob|tree)\/([^/]+)\/(.+)$/,
  );
  if (!match) {
    return { type: "other" };
  }

  const [, user, repo, blobOrTree, ref, path] = match;

  if (blobOrTree === "blob") {
    return {
      type: "blob",
      rawUrl: `https://raw.githubusercontent.com/${user}/${repo}/${ref}/${path}`,
      user,
      repo,
      ref,
      path,
    };
  }

  return { type: "tree", user, repo, ref, path };
}

/**
 * Fetch a single file from a URL. Returns the content as a string.
 */
export async function fetchFileContent(url: string): Promise<string> {
  const parsed = parseGitHubUrl(url);
  const fetchUrl = parsed.rawUrl ?? url;

  const response = await fetch(fetchUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${fetchUrl}: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

/**
 * Fetch a file from a URL and write it to a temporary directory.
 * Returns the path to the downloaded file.
 */
export async function fetchFileToTemp(url: string): Promise<string> {
  const content = await fetchFileContent(url);
  const tmpDir = await mkdtemp(join(tmpdir(), "harness-config-"));
  const filename = basename(new URL(url).pathname) || "file";
  const filePath = join(tmpDir, filename);
  await writeFile(filePath, content, "utf-8");
  return filePath;
}

/**
 * Fetch a directory from a GitHub tree URL using the GitHub API (tarball).
 * Returns the path to the temporary directory containing the tree contents.
 */
export async function fetchDirectoryToTemp(url: string): Promise<string> {
  const parsed = parseGitHubUrl(url);

  if (parsed.type === "tree" && parsed.user && parsed.repo && parsed.ref && parsed.path) {
    return fetchGitHubTreeToTemp(parsed.user, parsed.repo, parsed.ref, parsed.path);
  }

  throw new Error(
    `Cannot fetch directory from URL: ${url}. Only GitHub tree URLs are supported ` +
      `(e.g., https://github.com/user/repo/tree/main/path/to/dir)`,
  );
}

/**
 * Fetch a GitHub tree (subdirectory) using the API's tarball endpoint + extraction.
 * Falls back to recursive file listing via the Git Trees API.
 */
async function fetchGitHubTreeToTemp(
  user: string,
  repo: string,
  ref: string,
  treePath: string,
): Promise<string> {
  // Use the Git Trees API to list files, then fetch each one
  const apiUrl = `https://api.github.com/repos/${user}/${repo}/git/trees/${ref}?recursive=1`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "harness-config",
  };

  // Use GH_TOKEN or GITHUB_TOKEN if available for rate limits
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(apiUrl, { headers });
  if (!response.ok) {
    throw new Error(
      `GitHub API error fetching tree for ${user}/${repo}@${ref}: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as {
    tree: Array<{ path: string; type: string; url: string }>;
  };

  // Filter to files under the target path
  const prefix = treePath.endsWith("/") ? treePath : `${treePath}/`;
  const files = data.tree.filter(
    (entry) =>
      entry.type === "blob" &&
      (entry.path === treePath || entry.path.startsWith(prefix)),
  );

  if (files.length === 0) {
    throw new Error(`No files found at path "${treePath}" in ${user}/${repo}@${ref}`);
  }

  // Create temp directory and fetch each file
  const tmpDir = await mkdtemp(join(tmpdir(), "harness-config-skill-"));
  const destDir = join(tmpDir, basename(treePath));
  await mkdir(destDir, { recursive: true });

  for (const file of files) {
    const relativePath = file.path.startsWith(prefix)
      ? file.path.slice(prefix.length)
      : basename(file.path);
    const rawUrl = `https://raw.githubusercontent.com/${user}/${repo}/${ref}/${file.path}`;
    const content = await fetchFileContent(rawUrl);
    const destPath = join(destDir, relativePath);
    await mkdir(dirname(destPath), { recursive: true });
    await writeFile(destPath, content, "utf-8");
  }

  return destDir;
}

/**
 * Resolve a reference that might be a URL or a local path.
 * For URLs: fetches to temp and returns the local temp path.
 * For local paths: returns as-is (resolved against baseDir).
 */
export async function resolveReference(
  ref: string,
  baseDir: string,
  type: "file" | "directory",
): Promise<string> {
  if (!isUrl(ref)) {
    return join(baseDir, ref);
  }

  if (type === "file") {
    return fetchFileToTemp(ref);
  }

  return fetchDirectoryToTemp(ref);
}
