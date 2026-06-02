import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addSkill } from "../src/components/skills.ts";
import { claude } from "../src/harnesses/claude.ts";

describe("skill naming from SKILL.md frontmatter", () => {
  let tmpDir: string;
  let sourceDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "harness-config-skill-name-test-"));
    sourceDir = join(tmpDir, "source");
    await mkdir(sourceDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("uses SKILL.md name frontmatter when present", async () => {
    const skillDir = join(sourceDir, "my-dir-name");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      "---\nname: Custom Skill Name\ndescription: A skill\n---\nBody",
    );

    const destDir = join(tmpDir, "dest");
    await mkdir(destDir, { recursive: true });

    const result = await addSkill(claude, "./my-dir-name", "project", sourceDir, destDir);
    expect(result.installed).toContain("custom-skill-name");
  });

  it("falls back to directory basename when SKILL.md has no name", async () => {
    const skillDir = join(sourceDir, "fallback-dir");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      "---\ndescription: No name field\n---\nBody",
    );

    const destDir = join(tmpDir, "dest");
    await mkdir(destDir, { recursive: true });

    const result = await addSkill(claude, "./fallback-dir", "project", sourceDir, destDir);
    expect(result.installed).toContain("fallback-dir");
  });

  it("falls back to directory basename when SKILL.md doesn't exist", async () => {
    const skillDir = join(sourceDir, "no-skill-md");
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "README.md"), "# Not a SKILL.md");

    const destDir = join(tmpDir, "dest");
    await mkdir(destDir, { recursive: true });

    const result = await addSkill(claude, "./no-skill-md", "project", sourceDir, destDir);
    expect(result.installed).toContain("no-skill-md");
  });

  it("sanitizes frontmatter name to kebab-case", async () => {
    const skillDir = join(sourceDir, "raw-dir");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      '---\nname: "My AWESOME Skill!!!"\n---\nBody',
    );

    const destDir = join(tmpDir, "dest");
    await mkdir(destDir, { recursive: true });

    const result = await addSkill(claude, "./raw-dir", "project", sourceDir, destDir);
    expect(result.installed).toContain("my-awesome-skill");
  });
});
