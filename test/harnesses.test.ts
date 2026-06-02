import { describe, it, expect } from "vitest";
import { claude } from "../src/harnesses/claude.ts";
import { opencode } from "../src/harnesses/opencode.ts";
import { copilot } from "../src/harnesses/copilot.ts";
import { pi } from "../src/harnesses/pi.ts";
import type { McpDef } from "../src/manifest/schema.ts";

describe("harness MCP translation", () => {
  const stdioMcp: McpDef = {
    stdio: "npx -y @anthropic/mcp-fetch",
    env: ["HTTP_PROXY"],
  };

  const httpMcp: McpDef = {
    url: "https://api.githubcopilot.com/mcp/",
    auth: "env:GH_TOKEN",
  };

  const httpMcpWithHeaders: McpDef = {
    url: "https://api.example.com/mcp/",
    auth: "env:TOKEN",
    headers: { "X-Tenant-ID": "env:MY_TENANT" },
  };

  describe("Claude Code", () => {
    it("translates stdio MCP", () => {
      const result = claude.translateMcp("fetch", stdioMcp);
      expect(result).toEqual({
        command: "npx",
        args: ["-y", "@anthropic/mcp-fetch"],
        env: { HTTP_PROXY: "${env:HTTP_PROXY}" },
      });
    });

    it("translates HTTP MCP with auth", () => {
      const result = claude.translateMcp("github", httpMcp);
      expect(result).toEqual({
        url: "https://api.githubcopilot.com/mcp/",
        headers: { Authorization: "Bearer ${env:GH_TOKEN}" },
      });
    });

    it("translates HTTP MCP with headers", () => {
      const result = claude.translateMcp("custom", httpMcpWithHeaders);
      expect(result).toEqual({
        url: "https://api.example.com/mcp/",
        headers: {
          Authorization: "Bearer ${env:TOKEN}",
          "X-Tenant-ID": "${env:MY_TENANT}",
        },
      });
    });

    it("uses wrapper path when provided", () => {
      const result = claude.translateMcp("fetch", stdioMcp, "/home/user/.harness-config/wrappers/fetch.sh");
      expect(result).toEqual({
        command: "/home/user/.harness-config/wrappers/fetch.sh",
        args: [],
        env: { HTTP_PROXY: "${env:HTTP_PROXY}" },
      });
    });
  });

  describe("OpenCode", () => {
    it("translates stdio MCP with type:local and command array", () => {
      const result = opencode.translateMcp("fetch", stdioMcp);
      expect(result).toEqual({
        type: "local",
        command: ["npx", "-y", "@anthropic/mcp-fetch"],
        environment: { HTTP_PROXY: "{env:HTTP_PROXY}" },
      });
    });

    it("translates HTTP MCP with type:remote", () => {
      const result = opencode.translateMcp("github", httpMcp);
      expect(result).toEqual({
        type: "remote",
        url: "https://api.githubcopilot.com/mcp/",
        headers: { Authorization: "Bearer {env:GH_TOKEN}" },
      });
    });
  });

  describe("GitHub Copilot", () => {
    it("translates stdio MCP with type:stdio", () => {
      const result = copilot.translateMcp("fetch", stdioMcp);
      expect(result).toEqual({
        type: "stdio",
        command: "npx",
        args: ["-y", "@anthropic/mcp-fetch"],
        env: { HTTP_PROXY: "${env:HTTP_PROXY}" },
      });
    });

    it("translates HTTP MCP with type:http", () => {
      const result = copilot.translateMcp("github", httpMcp);
      expect(result).toEqual({
        type: "http",
        url: "https://api.githubcopilot.com/mcp/",
        headers: { Authorization: "Bearer ${env:GH_TOKEN}" },
      });
    });
  });

  describe("Pi", () => {
    it("translates stdio MCP same as Claude", () => {
      const result = pi.translateMcp("fetch", stdioMcp);
      expect(result).toEqual({
        command: "npx",
        args: ["-y", "@anthropic/mcp-fetch"],
        env: { HTTP_PROXY: "${env:HTTP_PROXY}" },
      });
    });

    it("translates HTTP MCP same as Claude", () => {
      const result = pi.translateMcp("github", httpMcp);
      expect(result).toEqual({
        url: "https://api.githubcopilot.com/mcp/",
        headers: { Authorization: "Bearer ${env:GH_TOKEN}" },
      });
    });

    it("uses wrapper path when provided", () => {
      const result = pi.translateMcp("fetch", stdioMcp, "/home/user/.harness-config/wrappers/fetch.sh");
      expect(result).toEqual({
        command: "/home/user/.harness-config/wrappers/fetch.sh",
        args: [],
        env: { HTTP_PROXY: "${env:HTTP_PROXY}" },
      });
    });
  });
});

describe("harness config paths", () => {
  it("Claude project MCP path is .mcp.json", () => {
    expect(claude.mcpConfigPath("project")).toBe(".mcp.json");
  });

  it("OpenCode project MCP path is opencode.json", () => {
    expect(opencode.mcpConfigPath("project")).toBe("opencode.json");
  });

  it("Copilot project MCP path is .github/copilot/mcp.json", () => {
    expect(copilot.mcpConfigPath("project")).toContain(".github");
    expect(copilot.mcpConfigPath("project")).toContain("mcp.json");
  });

  it("Pi project MCP path is .mcp.json", () => {
    expect(pi.mcpConfigPath("project")).toBe(".mcp.json");
  });

  it("Pi supports agents", () => {
    expect(pi.agentDir("project")).toBe(".agents/skills");
    expect(pi.supportsAgents).toBe(true);
  });

  it("Pi skill dir is .pi/skills", () => {
    expect(pi.skillDir("project")).toContain(".pi");
    expect(pi.skillDir("project")).toContain("skills");
  });
});
