import { describe, it, expect } from "vitest";
import {
  parseFrontmatter,
  transformAgentContent,
  transformAgentFrontmatter,
} from "../src/components/agents.ts";

describe("agent frontmatter parsing", () => {
  it("parses standard frontmatter", () => {
    const content = `---
name: Terraform Planner
description: Plans Terraform changes
model: claude-sonnet-4-20250514
---
You are a Terraform expert.`;

    const { frontmatter, body } = parseFrontmatter(content);
    expect(frontmatter.name).toBe("Terraform Planner");
    expect(frontmatter.description).toBe("Plans Terraform changes");
    expect(frontmatter.model).toBe("claude-sonnet-4-20250514");
    expect(body).toBe("You are a Terraform expert.");
  });

  it("handles content without frontmatter", () => {
    const content = "Just a plain markdown file.";
    const { frontmatter, body } = parseFrontmatter(content);
    expect(frontmatter).toEqual({});
    expect(body).toBe(content);
  });

  it("handles quoted values", () => {
    const content = `---
name: "My Agent"
description: 'A helpful agent'
---
Body`;
    const { frontmatter } = parseFrontmatter(content);
    expect(frontmatter.name).toBe("My Agent");
    expect(frontmatter.description).toBe("A helpful agent");
  });
});

describe("agent frontmatter transforms", () => {
  describe("Claude Code", () => {
    it("keeps name, description, model, temperature, tools", () => {
      const fm = {
        name: "Test",
        description: "Desc",
        model: "claude-sonnet-4-20250514",
        temperature: "0.7",
        tools: "Read, Write",
      };
      const result = transformAgentFrontmatter(fm, "claude");
      expect(result).toEqual(fm);
    });

    it("strips mode, color, permission", () => {
      const fm = {
        name: "Test",
        mode: "agent",
        color: "orange",
        permission: "full",
      };
      const result = transformAgentFrontmatter(fm, "claude");
      expect(result).toEqual({ name: "Test" });
    });
  });

  describe("OpenCode", () => {
    it("keeps all supported fields", () => {
      const fm = {
        name: "Test",
        description: "Desc",
        model: "gpt-4",
        temperature: "0.7",
        mode: "agent",
        permission: "full",
      };
      const result = transformAgentFrontmatter(fm, "opencode");
      expect(result).toEqual(fm);
    });

    it("converts named colors to hex", () => {
      const fm = { color: "orange" };
      const result = transformAgentFrontmatter(fm, "opencode");
      expect(result.color).toBe("#FF8C00");
    });

    it("passes through hex colors unchanged", () => {
      const fm = { color: "#123ABC" };
      const result = transformAgentFrontmatter(fm, "opencode");
      expect(result.color).toBe("#123ABC");
    });
  });

  describe("GitHub Copilot", () => {
    it("keeps name, description, tools", () => {
      const fm = {
        name: "Test",
        description: "Desc",
        tools: "Read, Write",
      };
      const result = transformAgentFrontmatter(fm, "copilot");
      expect(result).toEqual(fm);
    });

    it("strips model, temperature, mode, color, permission", () => {
      const fm = {
        name: "Test",
        model: "gpt-4",
        temperature: "0.7",
        mode: "agent",
        color: "blue",
        permission: "full",
      };
      const result = transformAgentFrontmatter(fm, "copilot");
      expect(result).toEqual({ name: "Test" });
    });
  });
});

describe("agent content transform", () => {
  it("produces correct output for Claude", () => {
    const content = `---
name: Architect
model: claude-sonnet-4-20250514
mode: agent
color: orange
---
You are a software architect.`;

    const result = transformAgentContent(content, "claude");
    expect(result).toContain("name: Architect");
    expect(result).toContain("model: claude-sonnet-4-20250514");
    expect(result).not.toContain("mode:");
    expect(result).not.toContain("color:");
    expect(result).toContain("You are a software architect.");
  });

  it("strips all frontmatter for harness that doesn't support agent fields (pi)", () => {
    const content = `---
name: Architect
model: claude-sonnet-4-20250514
---
You are a software architect.`;

    const result = transformAgentContent(content, "pi");
    // Pi doesn't support model field, strips it
    expect(result).not.toContain("model:");
    expect(result).toContain("name: Architect");
    expect(result).toContain("You are a software architect.");
  });
});
