import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeAdd, executeRm } from "../src/engine.ts";
import type { NormalizedManifest } from "../src/manifest/schema.ts";

describe("engine integration", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "harness-config-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  function makeManifest(overrides: Partial<NormalizedManifest> = {}): NormalizedManifest {
    return {
      name: "test",
      harnesses: new Map([["claude", null], ["opencode", null]]),
      mcps: {},
      skills: [],
      ...overrides,
    };
  }

  describe("add MCPs", () => {
    it("creates MCP configs for all target harnesses", async () => {
      const manifest = makeManifest({
        mcps: {
          fetch: {
            stdio: "npx -y @anthropic/mcp-fetch",
            env: ["HTTP_PROXY"],
          },
        },
      });

      const result = await executeAdd(manifest, {
        scope: "project",
        cwd: tmpDir,
      });

      expect(result.results).toHaveLength(2);
      expect(result.results[0].mcps).toEqual(["fetch"]);
      expect(result.results[1].mcps).toEqual(["fetch"]);

      // Check Claude config
      const claudeConfig = JSON.parse(await readFile(join(tmpDir, ".mcp.json"), "utf-8"));
      expect(claudeConfig.mcpServers.fetch).toEqual({
        command: "npx",
        args: ["-y", "@anthropic/mcp-fetch"],
        env: { HTTP_PROXY: "${env:HTTP_PROXY}" },
      });

      // Check OpenCode config
      const ocConfig = JSON.parse(await readFile(join(tmpDir, "opencode.json"), "utf-8"));
      expect(ocConfig.mcp.fetch).toEqual({
        type: "local",
        command: ["npx", "-y", "@anthropic/mcp-fetch"],
        environment: { HTTP_PROXY: "{env:HTTP_PROXY}" },
      });
    });

    it("merges into existing config without overwriting other servers", async () => {
      // Write existing config
      await writeFile(
        join(tmpDir, ".mcp.json"),
        JSON.stringify({
          mcpServers: { existing: { command: "foo", args: [] } },
        }),
      );

      const manifest = makeManifest({
        harnesses: new Map([["claude", null]]),
        mcps: { newServer: { stdio: "new-cmd" } },
      });

      await executeAdd(manifest, { scope: "project", cwd: tmpDir });

      const config = JSON.parse(await readFile(join(tmpDir, ".mcp.json"), "utf-8"));
      expect(config.mcpServers.existing).toEqual({ command: "foo", args: [] });
      expect(config.mcpServers.newServer).toBeDefined();
    });

    it("is idempotent — running twice produces same result", async () => {
      const manifest = makeManifest({
        harnesses: new Map([["claude", null]]),
        mcps: { server: { stdio: "cmd arg1 arg2" } },
      });

      await executeAdd(manifest, { scope: "project", cwd: tmpDir });
      const first = await readFile(join(tmpDir, ".mcp.json"), "utf-8");

      await executeAdd(manifest, { scope: "project", cwd: tmpDir });
      const second = await readFile(join(tmpDir, ".mcp.json"), "utf-8");

      expect(first).toBe(second);
    });
  });

  describe("rm MCPs", () => {
    it("removes named servers from config", async () => {
      await writeFile(
        join(tmpDir, ".mcp.json"),
        JSON.stringify({
          mcpServers: {
            keep: { command: "keep", args: [] },
            remove: { command: "remove", args: [] },
          },
        }),
      );

      const manifest = makeManifest({
        harnesses: new Map([["claude", null]]),
        mcps: { remove: { stdio: "__placeholder__" } as any },
      });

      await executeRm(manifest, { scope: "project", cwd: tmpDir });

      const config = JSON.parse(await readFile(join(tmpDir, ".mcp.json"), "utf-8"));
      expect(config.mcpServers.keep).toBeDefined();
      expect(config.mcpServers.remove).toBeUndefined();
    });

    it("is idempotent — removing non-existent is a no-op", async () => {
      await writeFile(join(tmpDir, ".mcp.json"), JSON.stringify({ mcpServers: {} }));

      const manifest = makeManifest({
        harnesses: new Map([["claude", null]]),
        mcps: { nonexistent: { stdio: "__placeholder__" } as any },
      });

      // Should not throw
      const result = await executeRm(manifest, { scope: "project", cwd: tmpDir });
      expect(result.results[0].mcps).toEqual(["nonexistent"]);
    });
  });

  describe("add agents", () => {
    it("installs agent with frontmatter transform", async () => {
      // Create agent source file
      const agentContent = `---
name: Architect
model: claude-sonnet-4-20250514
mode: agent
---
You are a software architect.`;
      await mkdir(join(tmpDir, "agents"), { recursive: true });
      await writeFile(join(tmpDir, "agents", "architect.md"), agentContent);

      const manifest = makeManifest({
        harnesses: new Map([["claude", { agents: ["./agents/architect.md"] }]]),
      });

      await executeAdd(manifest, { scope: "project", cwd: tmpDir });

      const installed = await readFile(join(tmpDir, ".claude", "agents", "architect.md"), "utf-8");
      expect(installed).toContain("name: Architect");
      expect(installed).toContain("model: claude-sonnet-4-20250514");
      expect(installed).toContain("mode: agent");
      expect(installed).toContain("You are a software architect.");
    });

    it("installs agents for harnesses that support them", async () => {
      await mkdir(join(tmpDir, "agents"), { recursive: true });
      await writeFile(join(tmpDir, "agents", "test.md"), "---\nname: Test\n---\nBody");

      const manifest = makeManifest({
        harnesses: new Map([["pi", { agents: ["./agents/test.md"] }]]),
      });

      const result = await executeAdd(manifest, { scope: "project", cwd: tmpDir });
      expect(result.results[0].agents).toHaveLength(1);
      expect(result.results[0].agents[0].name).toBe("test.md");
    });

    it("detects unchanged agents and skips write", async () => {
      const agentContent = `---\nname: Architect\n---\nYou are a software architect.`;
      await mkdir(join(tmpDir, "agents"), { recursive: true });
      await writeFile(join(tmpDir, "agents", "architect.md"), agentContent);

      const manifest = makeManifest({
        harnesses: new Map([["claude", { agents: ["./agents/architect.md"] }]]),
      });

      // First install
      await executeAdd(manifest, { scope: "project", cwd: tmpDir });
      const firstContent = await readFile(join(tmpDir, ".claude", "agents", "architect.md"), "utf-8");

      // Second install — should detect unchanged
      const { stat } = await import("node:fs/promises");
      const beforeStat = await stat(join(tmpDir, ".claude", "agents", "architect.md"));

      // Small delay to ensure mtime would differ if rewritten
      await new Promise(r => setTimeout(r, 50));
      await executeAdd(manifest, { scope: "project", cwd: tmpDir });

      const afterStat = await stat(join(tmpDir, ".claude", "agents", "architect.md"));
      const secondContent = await readFile(join(tmpDir, ".claude", "agents", "architect.md"), "utf-8");

      expect(firstContent).toBe(secondContent);
      // mtime should NOT have changed (file wasn't rewritten)
      expect(afterStat.mtimeMs).toBe(beforeStat.mtimeMs);
    });
  });

  describe("add skills", () => {
    it("copies skill directory to harness skill dir", async () => {
      // Create skill source
      await mkdir(join(tmpDir, "skills", "my-skill"), { recursive: true });
      await writeFile(join(tmpDir, "skills", "my-skill", "SKILL.md"), "# My Skill");

      const manifest = makeManifest({
        harnesses: new Map([["claude", null]]),
        skills: ["./skills/my-skill"],
      });

      await executeAdd(manifest, { scope: "project", cwd: tmpDir });

      const skillMd = await readFile(join(tmpDir, ".claude", "skills", "my-skill", "SKILL.md"), "utf-8");
      expect(skillMd).toBe("# My Skill");
    });
  });

  describe("harness filtering", () => {
    it("only targets specified harnesses with --harness filter", async () => {
      const manifest = makeManifest({
        mcps: { server: { stdio: "cmd" } },
      });

      const result = await executeAdd(manifest, {
        scope: "project",
        cwd: tmpDir,
        harnesses: ["claude"],
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].harness).toBe("Claude Code");
    });

    it("throws if filter harness not in manifest", async () => {
      const manifest = makeManifest({
        harnesses: new Map([["claude", null]]),
      });

      await expect(
        executeAdd(manifest, {
          scope: "project",
          cwd: tmpDir,
          harnesses: ["pi"],
        }),
      ).rejects.toThrow(/not declared in manifest/);
    });
  });
});
