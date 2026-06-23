import { join } from "node:path";
import { homedir } from "node:os";
import type { HarnessAdapter, McpJsonEntry, Scope } from "./types.ts";
import type { McpDef } from "../manifest/schema.ts";
import {
  parseStdioCommand,
  resolveEnvItems,
  buildHeaders,
  isStdio,
} from "./mcp-util.ts";

/**
 * IBM Bob — IBM's AI-first development partner / IDE.
 *
 * Config conventions (see https://bob.ibm.com/docs/ide):
 * - MCP: project `.bob/mcp.json`, global `~/.bob/mcp_settings.json`, key `mcpServers`
 * - Skills: `.bob/skills/<name>/SKILL.md` (project) or `~/.bob/skills/<name>/` (global)
 * - Env var substitution uses `${env:VAR}`, matching the engine's output
 *
 * Bob has no drop-in agent directory (it uses "modes" + AGENTS.md), so
 * `supportsAgents` is false and `agentDir` returns null.
 */
export const bob: HarnessAdapter = {
  name: "bob",
  displayName: "IBM Bob",
  mcpJsonKey: "mcpServers",
  supportsAgents: false,

  mcpConfigPath(scope: Scope): string {
    return scope === "global"
      ? join(homedir(), ".bob", "mcp_settings.json")
      : join(".bob", "mcp.json");
  },

  agentDir(_scope: Scope): string | null {
    // Bob uses modes (YAML) + AGENTS.md, not a drop-in agents directory.
    return null;
  },

  skillDir(scope: Scope): string {
    return scope === "global"
      ? join(homedir(), ".bob", "skills")
      : join(".bob", "skills");
  },

  configRoot(scope: Scope): string {
    return scope === "global"
      ? join(homedir(), ".bob")
      : ".bob";
  },

  translateMcp(name: string, def: McpDef, wrapperPath?: string): McpJsonEntry {
    if (isStdio(def)) {
      if (wrapperPath) {
        return {
          command: wrapperPath,
          args: [],
          ...(resolveEnvItems(def.env) && { env: resolveEnvItems(def.env) }),
        };
      }
      const { command, args } = parseStdioCommand(def.stdio);
      return {
        command,
        args,
        ...(resolveEnvItems(def.env) && { env: resolveEnvItems(def.env) }),
      };
    }

    // HTTP — Bob's modern remote transport is "streamable-http"
    const headers = buildHeaders(def.auth, def.headers);
    return {
      type: "streamable-http",
      url: def.url,
      ...(headers && { headers }),
    };
  },

  binaryNames: ["bob"],
};
