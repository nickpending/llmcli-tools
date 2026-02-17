/**
 * tests/services.test.ts
 *
 * Integration tests for service resolution:
 *   loadServices(), resolveService(), listServices()
 *
 * Strategy: mock "os" to redirect homedir() to a temp directory before the
 * module is loaded. This ensures CONFIG_DIR and SERVICES_PATH in services.ts
 * point to our temp dir, not the real ~/.config/llm-core/.
 *
 * Test ordering is intentional — the module-level cachedServices means:
 * - Error paths must run BEFORE a successful loadServices() call
 * - Once a successful call sets the cache, subsequent calls use it
 *
 * Order:
 *   1. Invalid TOML → throws (cache stays null)
 *   2. Delete file → first run generates defaults (cache gets set)
 *   3. resolveService/listServices tests → use the cache
 */

import { describe, it, expect, mock, afterAll } from "bun:test";
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  unlinkSync,
} from "fs";
import { join } from "path";

// Create temp home directory BEFORE importing services.ts
const tempHome = mkdtempSync("/tmp/llm-core-test-");
const configDir = join(tempHome, ".config", "llm-core");
const servicesPath = join(configDir, "services.toml");

// Pre-seed INVALID TOML so we can test error path before cache is set
mkdirSync(configDir, { recursive: true });
writeFileSync(servicesPath, "this is [broken toml = !!!", "utf-8");

// Mock "os" BEFORE importing services.ts — the module evaluates
// CONFIG_DIR/SERVICES_PATH using homedir() at load time
mock.module("os", () => ({
  homedir: () => tempHome,
}));

// Import AFTER mock is registered
const { loadServices, resolveService, listServices } =
  await import("/Users/rudy/development/projects/llmcli-tools/packages/llm-core/lib/services.ts");

afterAll(() => {
  rmSync(tempHome, { recursive: true, force: true });
});

// --- Error path: must run FIRST, before a successful loadServices() call ---

describe("loadServices() error path", () => {
  it("throws with file path in message on invalid TOML", () => {
    // File contains broken TOML — cachedServices is null going into this test
    expect(() => loadServices()).toThrow(servicesPath);
  });
});

// --- First-run: remove the broken file, test default generation ---

describe("loadServices() first run", () => {
  it("generates default services.toml when no file exists", () => {
    // Remove the broken file — cache is still null (error prevented cache set)
    unlinkSync(servicesPath);
    expect(existsSync(servicesPath)).toBe(false);

    const map = loadServices();

    // Default file was created
    expect(existsSync(servicesPath)).toBe(true);
    // Returns valid service map with expected defaults
    expect(map.default_service).toBe("anthropic");
    expect(typeof map.services).toBe("object");
    expect(Object.keys(map.services)).toHaveLength(3);
  });
});

// --- Happy path: cache is now set from "first run" test above ---

describe("loadServices() cached results", () => {
  it("returns all 3 default services with correct endpoints", () => {
    const map = loadServices(); // hits cache

    expect(map.services["anthropic"]).toMatchObject({
      adapter: "anthropic",
      key: "anthropic",
      base_url: "https://api.anthropic.com/v1",
    });
    expect(map.services["openai"]).toMatchObject({
      adapter: "openai",
      key: "openai",
      base_url: "https://api.openai.com/v1",
    });
    expect(map.services["ollama"]).toMatchObject({
      adapter: "ollama",
      base_url: "http://localhost:11434",
      key_required: false,
    });
  });
});

describe("resolveService()", () => {
  it("returns correct config for a named service", () => {
    const svc = resolveService("openai");
    expect(svc.adapter).toBe("openai");
    expect(svc.base_url).toBe("https://api.openai.com/v1");
  });

  it("returns default service when name is undefined", () => {
    const svc = resolveService(undefined);
    expect(svc.adapter).toBe("anthropic");
    expect(svc.base_url).toBe("https://api.anthropic.com/v1");
  });

  it("throws with helpful message listing available services for unknown name", () => {
    expect(() => resolveService("nonexistent-service")).toThrow(
      'Unknown service: "nonexistent-service"',
    );
    expect(() => resolveService("nonexistent-service")).toThrow("Available:");
  });
});

describe("listServices()", () => {
  it("returns all configured service names", () => {
    const names = listServices();
    expect(names).toContain("anthropic");
    expect(names).toContain("openai");
    expect(names).toContain("ollama");
    expect(names).toHaveLength(3);
  });
});
