import { join } from "node:path";
import { homedir } from "node:os";
import type { HarnessAdapter, McpJsonEntry, Scope } from "./types.ts";
import type { McpDef } from "../manifest/schema.ts";
import {
  parseStdioCommand,
  isStdio,
} from "./mcp-util.ts";
import type { EnvItem } from "../manifest/schema.ts";

/**
 * OpenCode uses {env:VAR} syntax (no dollar sign) and the key "environment" (not "env").
 */
function resolveEnvItemsOpencode(envItems: EnvItem[] | undefined): Record<string, string> | undefined {
  if (!envItems || envItems.length === 0) return undefined;
  const env: Record<string, string> = {};
  for (const item of envItems) {
    if (typeof item === "string") {
      env[item] = `{env:${item}}`;
    } else {
      for (const [key] of Object.entries(item)) {
        env[key] = `{env:${key}}`;
      }
    }
  }
  return env;
}

function resolveValueRefOpencode(ref: string): string {
  if (ref.startsWith("env:")) {
    const varName = ref.slice(4);
    return `{env:${varName}}`;
  }
  if (ref.startsWith("keychain:")) {
    return `__keychain:${ref.slice(9)}__`;
  }
  return ref;
}

function buildHeadersOpencode(
  auth?: string,
  headers?: Record<string, string>,
): Record<string, string> | undefined {
  const result: Record<string, string> = {};
  if (auth) {
    result["Authorization"] = `Bearer ${resolveValueRefOpencode(auth)}`;
  }
  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      result[key] = resolveValueRefOpencode(value);
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export const opencode: HarnessAdapter = {
  name: "opencode",
  displayName: "OpenCode",
  mcpJsonKey: "mcp",
  supportsAgents: true,

  mcpConfigPath(scope: Scope): string {
    return scope === "global"
      ? join(homedir(), ".config", "opencode", "opencode.json")
      : "opencode.json";
  },

  agentDir(scope: Scope): string {
    return scope === "global"
      ? join(homedir(), ".config", "opencode", "agents")
      : join(".opencode", "agents");
  },

  skillDir(scope: Scope): string {
    return scope === "global"
      ? join(homedir(), ".config", "opencode", "skills")
      : join(".opencode", "skills");
  },

  configRoot(scope: Scope): string {
    return scope === "global"
      ? join(homedir(), ".config", "opencode")
      : ".opencode";
  },

  translateMcp(name: string, def: McpDef, wrapperPath?: string): McpJsonEntry {
    if (isStdio(def)) {
      if (wrapperPath) {
        return {
          type: "local",
          command: [wrapperPath],
          ...(resolveEnvItemsOpencode(def.env) && { environment: resolveEnvItemsOpencode(def.env) }),
        };
      }
      const { command, args } = parseStdioCommand(def.stdio);
      return {
        type: "local",
        command: [command, ...args],
        ...(resolveEnvItemsOpencode(def.env) && { environment: resolveEnvItemsOpencode(def.env) }),
      };
    }

    // HTTP/SSE
    const headers = buildHeadersOpencode(def.auth, def.headers);
    return {
      type: "remote",
      url: def.url,
      ...(headers && { headers }),
    };
  },

  detectPaths(scope: Scope): string[] {
    return [this.mcpConfigPath(scope), this.configRoot(scope)];
  },
};
