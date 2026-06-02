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

export const copilot: HarnessAdapter = {
  name: "copilot",
  displayName: "GitHub Copilot",
  mcpJsonKey: "mcpServers",
  supportsAgents: true,

  mcpConfigPath(scope: Scope): string {
    return scope === "global"
      ? join(homedir(), ".mcp.json")
      : join(".github", "copilot", "mcp.json");
  },

  agentDir(scope: Scope): string {
    return scope === "global"
      ? join(homedir(), ".copilot", "agents")
      : join(".github", "agents");
  },

  skillDir(scope: Scope): string {
    return scope === "global"
      ? join(homedir(), ".copilot", "skills")
      : join(".github", "copilot", "skills");
  },

  configRoot(scope: Scope): string {
    return scope === "global"
      ? join(homedir(), ".copilot")
      : ".github";
  },

  translateMcp(name: string, def: McpDef, wrapperPath?: string): McpJsonEntry {
    if (isStdio(def)) {
      if (wrapperPath) {
        return {
          type: "stdio",
          command: wrapperPath,
          args: [],
          ...(resolveEnvItems(def.env) && { env: resolveEnvItems(def.env) }),
        };
      }
      const { command, args } = parseStdioCommand(def.stdio);
      return {
        type: "stdio",
        command,
        args,
        ...(resolveEnvItems(def.env) && { env: resolveEnvItems(def.env) }),
      };
    }

    // HTTP/SSE
    const headers = buildHeaders(def.auth, def.headers);
    return {
      type: "http",
      url: def.url,
      ...(headers && { headers }),
    };
  },

  detectPaths(scope: Scope): string[] {
    return [this.mcpConfigPath(scope), this.configRoot(scope)];
  },
};
