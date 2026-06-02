import type { HarnessName, McpDef } from "../manifest/schema.ts";

export type Scope = "project" | "global";

/**
 * Per-harness MCP JSON structure produced by the adapter.
 */
export interface McpJsonEntry {
  [key: string]: unknown;
}

/**
 * Each harness adapter provides methods for:
 * - Getting config file paths
 * - Translating MCP definitions to harness-native JSON
 * - Detecting existing installations
 */
export interface HarnessAdapter {
  /** Harness identifier */
  readonly name: HarnessName;

  /** Human-readable display name */
  readonly displayName: string;

  // --- Path resolution ---

  /** Path to MCP config JSON file */
  mcpConfigPath(scope: Scope): string;

  /** Directory for agent .md files (null if unsupported) */
  agentDir(scope: Scope): string | null;

  /** Directory for skill directories */
  skillDir(scope: Scope): string;

  /** Root config directory (for `files:` escape hatch dest resolution) */
  configRoot(scope: Scope): string;

  // --- MCP translation ---

  /** Top-level key in the MCP JSON file (e.g., "mcpServers" or "mcp") */
  readonly mcpJsonKey: string;

  /** Translate a manifest MCP definition to harness-native JSON entry */
  translateMcp(name: string, def: McpDef, wrapperPath?: string): McpJsonEntry;

  // --- Agent support ---

  /** Whether this harness supports agents */
  readonly supportsAgents: boolean;

  // --- Detection ---

  /** Paths to check for existing config (returns first match) */
  detectPaths(scope: Scope): string[];
}
