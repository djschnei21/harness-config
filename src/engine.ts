import { basename } from "node:path";
import type { NormalizedManifest, HarnessName, HarnessConfig, FileMapping } from "./manifest/schema.ts";
import { getHarness, type Scope } from "./harnesses/index.ts";
import { addMcps, removeMcps } from "./components/mcps.ts";
import { addAgent, removeAgent } from "./components/agents.ts";
import { addSkill, removeSkill } from "./components/skills.ts";
import { addFile, removeFile } from "./components/files.ts";
import { generateWrappers, removeWrappers } from "./keychain/wrappers.ts";
import { needsKeychainWrapper } from "./keychain/resolve.ts";

export interface EngineOptions {
  /** Target harnesses (subset filter). If empty, uses all from manifest. */
  harnesses?: HarnessName[];
  /** Scope: project-local or global (home directory) */
  scope: Scope;
  /** Working directory — where output configs are written */
  cwd: string;
  /** Optional callback fired after each operation completes */
  onProgress?: (event: ProgressEvent) => void;
}

export interface ProgressEvent {
  type: "mcp" | "agent" | "skill" | "file";
  name: string;
  path: string;
  action: "added" | "updated" | "removed" | "unchanged" | "skipped";
  harness: string;
}

export interface EngineResult {
  /** Per-harness results */
  results: HarnessResult[];
  /** Warnings (e.g., missing keychain items) */
  warnings: string[];
}

export interface HarnessResult {
  harness: string;
  mcps: string[];
  agents: ItemResult[];
  skills: ItemResult[];
  files: ItemResult[];
  skipped: { component: string; reason: string }[];
}

export interface ItemResult {
  name: string;
  path: string;
  unchanged: boolean;
}

/**
 * Execute the `add` operation: install manifest components to harnesses.
 */
export async function executeAdd(
  manifest: NormalizedManifest,
  options: EngineOptions,
): Promise<EngineResult> {
  const targetHarnesses = resolveTargetHarnesses(manifest, options.harnesses);
  const warnings: string[] = [];
  const results: HarnessResult[] = [];

  // Source paths resolve relative to manifest location; output relative to cwd
  const sourceDir = manifest.baseDir ?? options.cwd;

  // Generate wrappers for servers that need keychain resolution
  const wrapperPaths = await generateWrappers(manifest.mcps);

  for (const harnessName of targetHarnesses) {
    const adapter = getHarness(harnessName);
    const harnessConfig = manifest.harnesses.get(harnessName) ?? null;
    const result: HarnessResult = {
      harness: adapter.displayName,
      mcps: [],
      agents: [],
      skills: [],
      files: [],
      skipped: [],
    };

    // --- MCPs (universal) ---
    if (Object.keys(manifest.mcps).length > 0) {
      const mcpResult = await addMcps(adapter, manifest.mcps, options.scope, wrapperPaths, options.cwd);
      result.mcps = mcpResult.servers;
      if (options.onProgress) {
        for (const name of mcpResult.servers) {
          options.onProgress({ type: "mcp", name, path: mcpResult.configPath, action: "updated", harness: adapter.displayName });
        }
      }
    }

    // --- Skills (universal) ---
    for (const skillPath of manifest.skills) {
      const skillResult = await addSkill(adapter, skillPath, options.scope, sourceDir, options.cwd);
      const skillItem: ItemResult = {
        name: basename(skillPath),
        path: skillResult.installed,
        unchanged: skillResult.unchanged ?? false,
      };
      result.skills.push(skillItem);
      if (options.onProgress) {
        options.onProgress({ type: "skill", name: skillItem.name, path: skillItem.path, action: skillItem.unchanged ? "unchanged" : "added", harness: adapter.displayName });
      }
    }

    // --- Harness-specific components ---
    if (harnessConfig) {
      // Harness-specific agents
      if (harnessConfig.agents) {
        for (const agentPath of harnessConfig.agents) {
          const agentResult = await addAgent(adapter, agentPath, options.scope, sourceDir, options.cwd);
          if ("installed" in agentResult) {
            const item: ItemResult = {
              name: basename(agentPath),
              path: agentResult.installed,
              unchanged: agentResult.unchanged ?? false,
            };
            result.agents.push(item);
            if (options.onProgress) {
              options.onProgress({ type: "agent", name: item.name, path: item.path, action: item.unchanged ? "unchanged" : "added", harness: adapter.displayName });
            }
          } else {
            result.skipped.push({ component: agentPath, reason: agentResult.reason });
            if (options.onProgress) {
              options.onProgress({ type: "agent", name: basename(agentPath), path: "", action: "skipped", harness: adapter.displayName });
            }
          }
        }
      }

      // Harness-specific skills
      if (harnessConfig.skills) {
        for (const skillPath of harnessConfig.skills) {
          const skillResult = await addSkill(adapter, skillPath, options.scope, sourceDir, options.cwd);
          const skillItem: ItemResult = {
            name: basename(skillPath),
            path: skillResult.installed,
            unchanged: skillResult.unchanged ?? false,
          };
          result.skills.push(skillItem);
          if (options.onProgress) {
            options.onProgress({ type: "skill", name: skillItem.name, path: skillItem.path, action: skillItem.unchanged ? "unchanged" : "added", harness: adapter.displayName });
          }
        }
      }

      // Harness-specific files (escape hatch)
      if (harnessConfig.files) {
        for (const fileMapping of harnessConfig.files) {
          const fileResult = await addFile(adapter, fileMapping, options.scope, sourceDir, options.cwd);
          const fileItem: ItemResult = {
            name: fileMapping.dest,
            path: fileResult.installed,
            unchanged: fileResult.unchanged ?? false,
          };
          result.files.push(fileItem);
          if (options.onProgress) {
            options.onProgress({ type: "file", name: fileItem.name, path: fileItem.path, action: fileItem.unchanged ? "unchanged" : "added", harness: adapter.displayName });
          }
        }
      }

      // Rules and commands are just file copies to the config root
      if (harnessConfig.rules) {
        for (const rulePath of harnessConfig.rules) {
          const mapping: FileMapping = {
            source: rulePath,
            dest: `rules/${basename(rulePath)}`,
          };
          const fileResult = await addFile(adapter, mapping, options.scope, sourceDir, options.cwd);
          const fileItem: ItemResult = {
            name: mapping.dest,
            path: fileResult.installed,
            unchanged: fileResult.unchanged ?? false,
          };
          result.files.push(fileItem);
          if (options.onProgress) {
            options.onProgress({ type: "file", name: fileItem.name, path: fileItem.path, action: fileItem.unchanged ? "unchanged" : "added", harness: adapter.displayName });
          }
        }
      }

      if (harnessConfig.commands) {
        for (const cmdPath of harnessConfig.commands) {
          const mapping: FileMapping = {
            source: cmdPath,
            dest: `commands/${basename(cmdPath)}`,
          };
          const fileResult = await addFile(adapter, mapping, options.scope, sourceDir, options.cwd);
          const fileItem: ItemResult = {
            name: mapping.dest,
            path: fileResult.installed,
            unchanged: fileResult.unchanged ?? false,
          };
          result.files.push(fileItem);
          if (options.onProgress) {
            options.onProgress({ type: "file", name: fileItem.name, path: fileItem.path, action: fileItem.unchanged ? "unchanged" : "added", harness: adapter.displayName });
          }
        }
      }
    }

    results.push(result);
  }

  return { results, warnings };
}

/**
 * Execute the `rm` operation: remove manifest components from harnesses.
 */
export async function executeRm(
  manifest: NormalizedManifest,
  options: EngineOptions,
): Promise<EngineResult> {
  const targetHarnesses = resolveTargetHarnesses(manifest, options.harnesses);
  const warnings: string[] = [];
  const results: HarnessResult[] = [];

  for (const harnessName of targetHarnesses) {
    const adapter = getHarness(harnessName);
    const harnessConfig = manifest.harnesses.get(harnessName) ?? null;
    const result: HarnessResult = {
      harness: adapter.displayName,
      mcps: [],
      agents: [],
      skills: [],
      files: [],
      skipped: [],
    };

    // --- MCPs ---
    const mcpNames = Object.keys(manifest.mcps);
    if (mcpNames.length > 0) {
      const mcpResult = await removeMcps(adapter, mcpNames, options.scope, options.cwd);
      result.mcps = mcpResult.removed;
      if (options.onProgress) {
        for (const name of mcpResult.removed) {
          options.onProgress({ type: "mcp", name, path: mcpResult.configPath, action: "removed", harness: adapter.displayName });
        }
      }
    }

    // --- Skills ---
    for (const skillPath of manifest.skills) {
      const skillResult = await removeSkill(adapter, basename(skillPath), options.scope, options.cwd);
      if ("removed" in skillResult) {
        result.skills.push({ name: basename(skillPath), path: skillResult.removed, unchanged: false });
        if (options.onProgress) {
          options.onProgress({ type: "skill", name: basename(skillPath), path: skillResult.removed, action: "removed", harness: adapter.displayName });
        }
      } else {
        result.skipped.push({ component: skillPath, reason: skillResult.reason });
        if (options.onProgress) {
          options.onProgress({ type: "skill", name: basename(skillPath), path: "", action: "skipped", harness: adapter.displayName });
        }
      }
    }

    // --- Harness-specific components ---
    if (harnessConfig) {
      // Harness-specific agents
      if (harnessConfig.agents) {
        for (const agentPath of harnessConfig.agents) {
          const agentName = basename(agentPath, ".md");
          const agentResult = await removeAgent(adapter, basename(agentPath), options.scope, options.cwd);
          if ("removed" in agentResult) {
            result.agents.push({ name: agentName, path: agentResult.removed, unchanged: false });
            if (options.onProgress) {
              options.onProgress({ type: "agent", name: agentName, path: agentResult.removed, action: "removed", harness: adapter.displayName });
            }
          } else {
            result.skipped.push({ component: agentPath, reason: agentResult.reason });
            if (options.onProgress) {
              options.onProgress({ type: "agent", name: agentName, path: "", action: "skipped", harness: adapter.displayName });
            }
          }
        }
      }

      if (harnessConfig.skills) {
        for (const skillPath of harnessConfig.skills) {
          const skillResult = await removeSkill(adapter, basename(skillPath), options.scope, options.cwd);
          if ("removed" in skillResult) {
            result.skills.push({ name: basename(skillPath), path: skillResult.removed, unchanged: false });
            if (options.onProgress) {
              options.onProgress({ type: "skill", name: basename(skillPath), path: skillResult.removed, action: "removed", harness: adapter.displayName });
            }
          }
        }
      }
      if (harnessConfig.files) {
        for (const fileMapping of harnessConfig.files) {
          const fileResult = await removeFile(adapter, fileMapping, options.scope, options.cwd);
          if ("removed" in fileResult) {
            result.files.push({ name: fileMapping.dest, path: fileResult.removed, unchanged: false });
            if (options.onProgress) {
              options.onProgress({ type: "file", name: fileMapping.dest, path: fileResult.removed, action: "removed", harness: adapter.displayName });
            }
          }
        }
      }
      if (harnessConfig.rules) {
        for (const rulePath of harnessConfig.rules) {
          const mapping: FileMapping = { source: rulePath, dest: `rules/${basename(rulePath)}` };
          const fileResult = await removeFile(adapter, mapping, options.scope, options.cwd);
          if ("removed" in fileResult) {
            result.files.push({ name: mapping.dest, path: fileResult.removed, unchanged: false });
            if (options.onProgress) {
              options.onProgress({ type: "file", name: mapping.dest, path: fileResult.removed, action: "removed", harness: adapter.displayName });
            }
          }
        }
      }
      if (harnessConfig.commands) {
        for (const cmdPath of harnessConfig.commands) {
          const mapping: FileMapping = { source: cmdPath, dest: `commands/${basename(cmdPath)}` };
          const fileResult = await removeFile(adapter, mapping, options.scope, options.cwd);
          if ("removed" in fileResult) {
            result.files.push({ name: mapping.dest, path: fileResult.removed, unchanged: false });
            if (options.onProgress) {
              options.onProgress({ type: "file", name: mapping.dest, path: fileResult.removed, action: "removed", harness: adapter.displayName });
            }
          }
        }
      }
    }

    results.push(result);
  }

  // Remove keychain wrappers
  const mcpNames = Object.keys(manifest.mcps);
  const serversWithWrappers = mcpNames.filter((name) => needsKeychainWrapper(manifest.mcps[name]));
  if (serversWithWrappers.length > 0) {
    await removeWrappers(serversWithWrappers);
  }

  return { results, warnings };
}

/**
 * Determine which harnesses to target.
 * If options.harnesses is specified, intersect with manifest's declared harnesses.
 */
function resolveTargetHarnesses(
  manifest: NormalizedManifest,
  filterHarnesses?: HarnessName[],
): HarnessName[] {
  const declaredHarnesses = Array.from(manifest.harnesses.keys());

  if (!filterHarnesses || filterHarnesses.length === 0) {
    return declaredHarnesses;
  }

  // Validate that filter is a subset of declared
  const invalid = filterHarnesses.filter((h) => !declaredHarnesses.includes(h));
  if (invalid.length > 0) {
    throw new Error(
      `Harness(es) ${invalid.map((h) => `"${h}"`).join(", ")} not declared in manifest. ` +
        `Available: ${declaredHarnesses.join(", ")}`,
    );
  }

  return filterHarnesses;
}
