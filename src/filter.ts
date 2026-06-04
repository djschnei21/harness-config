import { basename } from "node:path";
import pc from "picocolors";
import type { NormalizedManifest, HarnessName, HarnessConfig, UniversalAgent } from "./manifest/schema.ts";
import { getHarness } from "./harnesses/index.ts";

/**
 * Composite key format: "type:harness:name"
 * - Universal MCPs: "mcp::github"
 * - Universal skills: "skill::code-review"
 * - Harness-specific agents: "agent:claude:architect.md"
 * - Harness-specific skills: "skill:pi:architecture"
 * - Harness-specific rules: "rule:claude:standards.md"
 * - Harness-specific commands: "command:claude:deploy.md"
 * - Harness-specific files: "file:claude:dest/path"
 */
export interface ComponentKey {
  type: "mcp" | "skill" | "agent" | "rule" | "command" | "file";
  harness: string; // empty string for universal
  name: string;
}

export function encodeComponentKey(key: ComponentKey): string {
  return `${key.type}:${key.harness}:${key.name}`;
}

export function decodeComponentKey(encoded: string): ComponentKey {
  const firstColon = encoded.indexOf(":");
  const secondColon = encoded.indexOf(":", firstColon + 1);
  return {
    type: encoded.slice(0, firstColon) as ComponentKey["type"],
    harness: encoded.slice(firstColon + 1, secondColon),
    name: encoded.slice(secondColon + 1),
  };
}

export interface ComponentTreeGroup {
  label: string;
  items: { value: string; label: string; hint?: string }[];
}

/**
 * Build the component tree options for groupMultiselect.
 * Returns a Record<groupLabel, options[]> for @clack/prompts groupMultiselect,
 * plus the list of initialValues (pre-selected keys).
 */
export function buildComponentTreeOptions(
  manifest: NormalizedManifest,
  selectedHarnesses: HarnessName[],
  declaredHarnesses: HarnessName[],
): { options: Record<string, { value: string; label: string; hint?: string }[]>; initialValues: string[] } {
  const options: Record<string, { value: string; label: string; hint?: string }[]> = {};
  const initialValues: string[] = [];

  // --- Universal MCPs ---
  const mcpNames = Object.keys(manifest.mcps);
  if (mcpNames.length > 0) {
    const mcpItems = mcpNames.map((name) => {
      const key = encodeComponentKey({ type: "mcp", harness: "", name });
      initialValues.push(key);
      return { value: key, label: name };
    });
    options["MCPs"] = mcpItems;
  }

  // --- Universal Skills ---
  if (manifest.skills.length > 0) {
    const skillItems = manifest.skills.map((skillPath) => {
      const name = basename(skillPath);
      const key = encodeComponentKey({ type: "skill", harness: "", name });
      initialValues.push(key);
      return { value: key, label: name };
    });
    options["Skills"] = skillItems;
  }

  // --- Universal Agents ---
  if ((manifest.agents ?? []).length > 0) {
    const agentItems = manifest.agents.map((agent) => {
      const name = basename(agent.source);
      const key = encodeComponentKey({ type: "agent", harness: "", name });
      initialValues.push(key);
      return { value: key, label: basename(name, ".md") };
    });
    options["Agents"] = agentItems;
  }

  // --- Harness-specific components ---
  for (const [harnessName, config] of manifest.harnesses) {
    if (!config) continue;
    const isSelected = selectedHarnesses.includes(harnessName);
    const isSupported = declaredHarnesses.includes(harnessName);
    const adapter = getHarness(harnessName);
    const displayName = adapter.displayName;

    // Build annotation for group label
    const annotation = !isSupported ? ` ${pc.dim("(unsupported)")}` : "";

    // Agents
    if (config.agents && config.agents.length > 0) {
      const groupLabel = `${displayName} > Agents${annotation}`;
      const items = config.agents.map((agentPath) => {
        const name = basename(agentPath, ".md");
        const key = encodeComponentKey({ type: "agent", harness: harnessName, name: basename(agentPath) });
        if (isSelected) initialValues.push(key);
        const hint = !isSelected ? harnessName : undefined;
        return { value: key, label: name, hint };
      });
      options[groupLabel] = items;
    }

    // Skills
    if (config.skills && config.skills.length > 0) {
      const groupLabel = `${displayName} > Skills${annotation}`;
      const items = config.skills.map((skillPath) => {
        const name = basename(skillPath);
        const key = encodeComponentKey({ type: "skill", harness: harnessName, name });
        if (isSelected) initialValues.push(key);
        const hint = !isSelected ? harnessName : undefined;
        return { value: key, label: name, hint };
      });
      options[groupLabel] = items;
    }

    // Rules
    if (config.rules && config.rules.length > 0) {
      const groupLabel = `${displayName} > Rules${annotation}`;
      const items = config.rules.map((rulePath) => {
        const name = basename(rulePath);
        const key = encodeComponentKey({ type: "rule", harness: harnessName, name });
        if (isSelected) initialValues.push(key);
        const hint = !isSelected ? harnessName : undefined;
        return { value: key, label: name, hint };
      });
      options[groupLabel] = items;
    }

    // Commands
    if (config.commands && config.commands.length > 0) {
      const groupLabel = `${displayName} > Commands${annotation}`;
      const items = config.commands.map((cmdPath) => {
        const name = basename(cmdPath);
        const key = encodeComponentKey({ type: "command", harness: harnessName, name });
        if (isSelected) initialValues.push(key);
        const hint = !isSelected ? harnessName : undefined;
        return { value: key, label: name, hint };
      });
      options[groupLabel] = items;
    }

    // Files
    if (config.files && config.files.length > 0) {
      const groupLabel = `${displayName} > Files${annotation}`;
      const items = config.files.map((fileMapping) => {
        const key = encodeComponentKey({ type: "file", harness: harnessName, name: fileMapping.dest });
        if (isSelected) initialValues.push(key);
        const hint = !isSelected ? harnessName : undefined;
        return { value: key, label: fileMapping.dest, hint };
      });
      options[groupLabel] = items;
    }
  }

  return { options, initialValues };
}

/**
 * Count total components in the manifest (for deciding whether to show the tree).
 */
export function countManifestComponents(manifest: NormalizedManifest): number {
  let count = Object.keys(manifest.mcps).length + manifest.skills.length + (manifest.agents ?? []).length;
  for (const [, config] of manifest.harnesses) {
    if (!config) continue;
    count += (config.agents?.length ?? 0);
    count += (config.skills?.length ?? 0);
    count += (config.rules?.length ?? 0);
    count += (config.commands?.length ?? 0);
    count += (config.files?.length ?? 0);
  }
  return count;
}

/**
 * Filter a NormalizedManifest to include only selected components.
 * Returns a new manifest — does not mutate the original.
 */
export function filterManifest(
  manifest: NormalizedManifest,
  selectedKeys: string[],
): NormalizedManifest {
  const selected = new Set(selectedKeys);

  // Filter MCPs
  const filteredMcps: Record<string, typeof manifest.mcps[string]> = {};
  for (const name of Object.keys(manifest.mcps)) {
    const key = encodeComponentKey({ type: "mcp", harness: "", name });
    if (selected.has(key)) {
      filteredMcps[name] = manifest.mcps[name];
    }
  }

  // Filter universal skills
  const filteredSkills = manifest.skills.filter((skillPath) => {
    const name = basename(skillPath);
    const key = encodeComponentKey({ type: "skill", harness: "", name });
    return selected.has(key);
  });

  // Filter universal agents
  const filteredAgents = (manifest.agents ?? []).filter((agent) => {
    const name = basename(agent.source);
    const key = encodeComponentKey({ type: "agent", harness: "", name });
    return selected.has(key);
  });

  // Filter harness-specific components
  const filteredHarnesses = new Map<HarnessName, HarnessConfig | null>();
  for (const [harnessName, config] of manifest.harnesses) {
    if (!config) {
      filteredHarnesses.set(harnessName, config);
      continue;
    }

    const filteredConfig: NonNullable<HarnessConfig> = {};

    if (config.agents) {
      const filteredAgents = config.agents.filter((agentPath) => {
        const key = encodeComponentKey({ type: "agent", harness: harnessName, name: basename(agentPath) });
        return selected.has(key);
      });
      if (filteredAgents.length > 0) filteredConfig.agents = filteredAgents;
    }

    if (config.skills) {
      const filteredHarnessSkills = config.skills.filter((skillPath) => {
        const key = encodeComponentKey({ type: "skill", harness: harnessName, name: basename(skillPath) });
        return selected.has(key);
      });
      if (filteredHarnessSkills.length > 0) filteredConfig.skills = filteredHarnessSkills;
    }

    if (config.rules) {
      const filteredRules = config.rules.filter((rulePath) => {
        const key = encodeComponentKey({ type: "rule", harness: harnessName, name: basename(rulePath) });
        return selected.has(key);
      });
      if (filteredRules.length > 0) filteredConfig.rules = filteredRules;
    }

    if (config.commands) {
      const filteredCommands = config.commands.filter((cmdPath) => {
        const key = encodeComponentKey({ type: "command", harness: harnessName, name: basename(cmdPath) });
        return selected.has(key);
      });
      if (filteredCommands.length > 0) filteredConfig.commands = filteredCommands;
    }

    if (config.files) {
      const filteredFiles = config.files.filter((fileMapping) => {
        const key = encodeComponentKey({ type: "file", harness: harnessName, name: fileMapping.dest });
        return selected.has(key);
      });
      if (filteredFiles.length > 0) filteredConfig.files = filteredFiles;
    }

    // Set to null if everything was filtered out, preserve config shape otherwise
    const hasContent = filteredConfig.agents || filteredConfig.skills || filteredConfig.rules || filteredConfig.commands || filteredConfig.files;
    filteredHarnesses.set(harnessName, hasContent ? filteredConfig : null);
  }

  return {
    name: manifest.name,
    description: manifest.description,
    harnesses: filteredHarnesses,
    mcps: filteredMcps,
    skills: filteredSkills,
    agents: filteredAgents,
    baseDir: manifest.baseDir,
  };
}
