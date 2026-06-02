import { describe, it, expect } from "vitest";
import {
  extractKeychainRefs,
  extractAuthKeychainRef,
  extractHeaderKeychainRefs,
  needsKeychainWrapper,
} from "../src/keychain/resolve.ts";
import type { McpDef } from "../src/manifest/schema.ts";

describe("keychain reference extraction", () => {
  it("extracts keychain refs from env items", () => {
    const def: McpDef = {
      stdio: "cmd",
      env: [
        "PLAIN_VAR",
        { SECRET: "keychain:my-service" },
        { ANOTHER: "keychain:another-service" },
      ],
    };
    const refs = extractKeychainRefs(def);
    expect(refs).toEqual({
      SECRET: "my-service",
      ANOTHER: "another-service",
    });
  });

  it("returns empty for no keychain refs", () => {
    const def: McpDef = {
      stdio: "cmd",
      env: ["VAR1", "VAR2"],
    };
    const refs = extractKeychainRefs(def);
    expect(refs).toEqual({});
  });

  it("extracts auth keychain ref", () => {
    expect(extractAuthKeychainRef("keychain:my-token")).toBe("my-token");
    expect(extractAuthKeychainRef("env:GH_TOKEN")).toBeNull();
    expect(extractAuthKeychainRef(undefined)).toBeNull();
  });

  it("extracts header keychain refs", () => {
    const refs = extractHeaderKeychainRefs({
      "X-Token": "keychain:header-token",
      "X-Plain": "env:PLAIN",
    });
    expect(refs).toEqual({ "X-Token": "header-token" });
  });
});

describe("keychain wrapper detection", () => {
  it("detects need for wrapper when stdio has keychain env", () => {
    const def: McpDef = {
      stdio: "cmd",
      env: [{ SECRET: "keychain:my-service" }],
    };
    expect(needsKeychainWrapper(def)).toBe(true);
  });

  it("does not need wrapper for plain env", () => {
    const def: McpDef = {
      stdio: "cmd",
      env: ["PLAIN"],
    };
    expect(needsKeychainWrapper(def)).toBe(false);
  });

  it("does not need wrapper for HTTP servers", () => {
    const def: McpDef = {
      url: "https://example.com",
      auth: "keychain:token",
    };
    expect(needsKeychainWrapper(def)).toBe(false);
  });

  it("does not need wrapper when no env", () => {
    const def: McpDef = { stdio: "cmd" };
    expect(needsKeychainWrapper(def)).toBe(false);
  });
});
