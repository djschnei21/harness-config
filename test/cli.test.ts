import { describe, it, expect } from "vitest";
import { parseArgs } from "../src/cli.ts";

describe("CLI argument parsing", () => {
  function argv(...args: string[]): string[] {
    return ["node", "harness-config", ...args];
  }

  it("parses add command", () => {
    const result = parseArgs(argv("add"));
    expect(result.command).toBe("add");
  });

  it("parses rm command", () => {
    const result = parseArgs(argv("rm"));
    expect(result.command).toBe("rm");
  });

  it("parses manifest path", () => {
    const result = parseArgs(argv("add", "./my-config.yaml"));
    expect(result.command).toBe("add");
    expect(result.manifestPath).toBe("./my-config.yaml");
  });

  it("parses --harness flag (single)", () => {
    const result = parseArgs(argv("add", "--harness", "claude"));
    expect(result.harnesses).toEqual(["claude"]);
  });

  it("parses --harness flag (multiple)", () => {
    const result = parseArgs(argv("add", "--harness", "claude", "--harness", "opencode"));
    expect(result.harnesses).toEqual(["claude", "opencode"]);
  });

  it("parses --global flag", () => {
    const result = parseArgs(argv("add", "--global"));
    expect(result.global).toBe(true);
  });

  it("parses -g shorthand", () => {
    const result = parseArgs(argv("add", "-g"));
    expect(result.global).toBe(true);
  });

  it("parses --yes flag", () => {
    const result = parseArgs(argv("add", "--yes"));
    expect(result.yes).toBe(true);
  });

  it("parses -y shorthand", () => {
    const result = parseArgs(argv("add", "-y"));
    expect(result.yes).toBe(true);
  });

  it("parses --help", () => {
    const result = parseArgs(argv("--help"));
    expect(result.command).toBe("help");
  });

  it("parses -h", () => {
    const result = parseArgs(argv("-h"));
    expect(result.command).toBe("help");
  });

  it("parses --version", () => {
    const result = parseArgs(argv("--version"));
    expect(result.command).toBe("version");
  });

  it("parses -v", () => {
    const result = parseArgs(argv("-v"));
    expect(result.command).toBe("version");
  });

  it("throws on invalid harness name", () => {
    expect(() => parseArgs(argv("add", "--harness", "invalid"))).toThrow(/Invalid harness/);
  });

  it("throws on unknown flag", () => {
    expect(() => parseArgs(argv("add", "--unknown"))).toThrow(/Unknown flag/);
  });

  it("parses complex combined command", () => {
    const result = parseArgs(argv(
      "add", "./config.yaml",
      "--harness", "claude",
      "--harness", "opencode",
      "--global",
      "--yes",
    ));
    expect(result.command).toBe("add");
    expect(result.manifestPath).toBe("./config.yaml");
    expect(result.harnesses).toEqual(["claude", "opencode"]);
    expect(result.global).toBe(true);
    expect(result.yes).toBe(true);
  });
});
