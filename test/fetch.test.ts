import { describe, it, expect } from "vitest";
import { isUrl, parseGitHubUrl } from "../src/util/fetch.ts";

describe("URL detection", () => {
  it("detects http URLs", () => {
    expect(isUrl("http://example.com/file.yaml")).toBe(true);
  });

  it("detects https URLs", () => {
    expect(isUrl("https://github.com/user/repo/blob/main/file.md")).toBe(true);
  });

  it("rejects local paths", () => {
    expect(isUrl("./skills/code-review")).toBe(false);
    expect(isUrl("../agents/architect.md")).toBe(false);
    expect(isUrl("/absolute/path")).toBe(false);
    expect(isUrl("relative/path")).toBe(false);
  });
});

describe("GitHub URL parsing", () => {
  it("parses blob URLs to raw URLs", () => {
    const result = parseGitHubUrl(
      "https://github.com/user/repo/blob/main/agents/architect.md",
    );
    expect(result.type).toBe("blob");
    expect(result.rawUrl).toBe(
      "https://raw.githubusercontent.com/user/repo/main/agents/architect.md",
    );
    expect(result.user).toBe("user");
    expect(result.repo).toBe("repo");
    expect(result.ref).toBe("main");
    expect(result.path).toBe("agents/architect.md");
  });

  it("parses tree URLs", () => {
    const result = parseGitHubUrl(
      "https://github.com/someone/cool-skills/tree/main/skills/code-review",
    );
    expect(result.type).toBe("tree");
    expect(result.user).toBe("someone");
    expect(result.repo).toBe("cool-skills");
    expect(result.ref).toBe("main");
    expect(result.path).toBe("skills/code-review");
  });

  it("recognizes raw.githubusercontent.com URLs", () => {
    const result = parseGitHubUrl(
      "https://raw.githubusercontent.com/user/repo/main/file.md",
    );
    expect(result.type).toBe("raw");
    expect(result.rawUrl).toBe(
      "https://raw.githubusercontent.com/user/repo/main/file.md",
    );
  });

  it("handles non-GitHub URLs as 'other'", () => {
    const result = parseGitHubUrl("https://example.com/file.yaml");
    expect(result.type).toBe("other");
  });

  it("handles GitHub URLs with refs containing slashes", () => {
    const result = parseGitHubUrl(
      "https://github.com/user/repo/blob/feature/branch/path/file.md",
    );
    // This won't match our regex cleanly since ref has a slash
    // The regex captures first segment as ref — this is a known limitation
    expect(result.type).toBe("blob");
    expect(result.ref).toBe("feature");
  });
});
