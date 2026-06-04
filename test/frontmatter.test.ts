import { describe, it, expect } from "vitest";
import { mergeAgentOverrides, parseFrontmatter, serializeFrontmatter } from "../src/util/frontmatter.ts";

describe("parseFrontmatter", () => {
  it("parses YAML frontmatter and body", () => {
    const content = `---
name: architect
description: A software architect
model: sonnet
---
You are a software architect.`;

    const { frontmatter, body } = parseFrontmatter(content);

    expect(frontmatter).toEqual({
      name: "architect",
      description: "A software architect",
      model: "sonnet",
    });
    expect(body).toBe("You are a software architect.");
  });

  it("handles content with no frontmatter", () => {
    const content = "Just a plain markdown file.";
    const { frontmatter, body } = parseFrontmatter(content);

    expect(frontmatter).toEqual({});
    expect(body).toBe("Just a plain markdown file.");
  });

  it("handles empty frontmatter", () => {
    const content = `---
---
Body text here.`;

    const { frontmatter, body } = parseFrontmatter(content);

    expect(frontmatter).toEqual({});
    expect(body).toBe("Body text here.");
  });

  it("handles complex YAML values (arrays, nested)", () => {
    const content = `---
name: architect
tools:
  - Read
  - Grep
  - Glob
---
Body.`;

    const { frontmatter, body } = parseFrontmatter(content);

    expect(frontmatter).toEqual({
      name: "architect",
      tools: ["Read", "Grep", "Glob"],
    });
    expect(body).toBe("Body.");
  });

  it("handles frontmatter with boolean and number values", () => {
    const content = `---
name: agent
maxTurns: 30
verbose: true
---
Body.`;

    const { frontmatter, body } = parseFrontmatter(content);

    expect(frontmatter).toEqual({
      name: "agent",
      maxTurns: 30,
      verbose: true,
    });
    expect(body).toBe("Body.");
  });
});

describe("serializeFrontmatter", () => {
  it("serializes frontmatter and body", () => {
    const result = serializeFrontmatter(
      { name: "architect", model: "sonnet" },
      "Body text.",
    );

    expect(result).toContain("---");
    expect(result).toContain("name: architect");
    expect(result).toContain("model: sonnet");
    expect(result).toContain("Body text.");
  });

  it("returns body only when frontmatter is empty", () => {
    const result = serializeFrontmatter({}, "Body text.");
    expect(result).toBe("Body text.");
  });

  it("serializes arrays correctly", () => {
    const result = serializeFrontmatter(
      { tools: ["Read", "Grep"] },
      "Body.",
    );

    expect(result).toContain("tools:");
    expect(result).toContain("- Read");
    expect(result).toContain("- Grep");
  });
});

describe("mergeAgentOverrides", () => {
  it("merges override keys into existing frontmatter", () => {
    const source = `---
description: Analyzes codebases
name: architect
---
You are a software architect.`;

    const result = mergeAgentOverrides(source, {
      model: "sonnet",
      tools: ["Read", "Grep"],
    });

    expect(result).toContain("description: Analyzes codebases");
    expect(result).toContain("name: architect");
    expect(result).toContain("model: sonnet");
    expect(result).toContain("- Read");
    expect(result).toContain("- Grep");
    expect(result).toContain("You are a software architect.");
  });

  it("overwrites existing keys with override values", () => {
    const source = `---
name: architect
model: haiku
---
Body.`;

    const result = mergeAgentOverrides(source, { model: "sonnet" });

    expect(result).toContain("model: sonnet");
    expect(result).not.toContain("model: haiku");
    expect(result).toContain("name: architect");
    expect(result).toContain("Body.");
  });

  it("removes keys when override value is null", () => {
    const source = `---
name: architect
model: sonnet
tools:
  - Read
  - Write
---
Body.`;

    const result = mergeAgentOverrides(source, { tools: null });

    expect(result).toContain("name: architect");
    expect(result).toContain("model: sonnet");
    expect(result).not.toContain("tools");
    expect(result).not.toContain("Read");
    expect(result).toContain("Body.");
  });

  it("preserves body content exactly", () => {
    const body = "You are a software architect.\n\nAnalyze the codebase.\n\n## Guidelines\n\n- Be thorough\n- Be concise";
    const source = `---
name: architect
---
${body}`;

    const result = mergeAgentOverrides(source, { model: "sonnet" });

    expect(result).toContain(body);
  });

  it("handles source with no frontmatter — creates frontmatter from overrides", () => {
    const source = "You are a software architect.";

    const result = mergeAgentOverrides(source, { model: "sonnet", name: "architect" });

    expect(result).toContain("---");
    expect(result).toContain("model: sonnet");
    expect(result).toContain("name: architect");
    expect(result).toContain("You are a software architect.");
  });

  it("handles empty overrides — returns source unchanged (structurally)", () => {
    const source = `---
name: architect
---
Body.`;

    const result = mergeAgentOverrides(source, {});

    // Content should be equivalent (frontmatter preserved, body preserved)
    expect(result).toContain("name: architect");
    expect(result).toContain("Body.");
  });

  it("handles multiple null deletions", () => {
    const source = `---
name: architect
model: sonnet
tools:
  - Read
maxTurns: 30
---
Body.`;

    const result = mergeAgentOverrides(source, {
      model: null,
      maxTurns: null,
    });

    expect(result).toContain("name: architect");
    expect(result).not.toContain("model:");
    expect(result).not.toContain("maxTurns:");
    expect(result).toContain("tools:");
    expect(result).toContain("Body.");
  });

  it("handles null deletion of non-existent key (no error)", () => {
    const source = `---
name: architect
---
Body.`;

    const result = mergeAgentOverrides(source, { nonexistent: null });

    expect(result).toContain("name: architect");
    expect(result).toContain("Body.");
  });

  it("preserves multiline body with code blocks", () => {
    const source = `---
name: coder
---
Write code.

\`\`\`typescript
const x = 1;
\`\`\`

Done.`;

    const result = mergeAgentOverrides(source, { model: "sonnet" });

    expect(result).toContain("```typescript");
    expect(result).toContain("const x = 1;");
    expect(result).toContain("Done.");
  });
});
