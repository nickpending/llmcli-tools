import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { loadCatalog, saveCatalog, findEntry, addEntry, removeEntry } from "../lib/catalog";
import type { CatalogEntry, Catalog } from "../lib/types";

const tmpDir = join("/tmp", "kit-test-catalog");
const catalogFile = join(tmpDir, "kit-catalog.yaml");

const sampleEntry: CatalogEntry = {
  name: "recon-methodology",
  repo: "https://github.com/user/forge",
  path: "skills/recon-methodology",
  type: "skill",
  domain: ["security", "reconnaissance"],
  tags: ["recon", "methodology"],
  description: "Recon methodology skill",
};

const sampleYaml = `skills:
  - name: recon-methodology
    repo: https://github.com/user/forge
    path: skills/recon-methodology
    type: skill
    domain:
      - security
      - reconnaissance
    tags:
      - recon
      - methodology
    description: Recon methodology skill
commands:
  - name: bash-function
    repo: https://github.com/user/dev-skills
    path: commands/bash-function.md
    type: command
    domain:
      - development
    tags:
      - bash
      - utility
`;

beforeEach(() => {
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("loadCatalog", () => {
  it("returns empty catalog when file doesn't exist", () => {
    const catalog = loadCatalog(join(tmpDir, "nonexistent.yaml"));
    expect(catalog.entries).toEqual([]);
  });

  it("parses YAML catalog with type sections", () => {
    writeFileSync(catalogFile, sampleYaml);
    const catalog = loadCatalog(catalogFile);
    expect(catalog.entries).toHaveLength(2);
    expect(catalog.entries[0].name).toBe("recon-methodology");
    expect(catalog.entries[0].type).toBe("skill");
    expect(catalog.entries[1].name).toBe("bash-function");
    expect(catalog.entries[1].type).toBe("command");
  });

  it("validates required fields", () => {
    writeFileSync(catalogFile, `skills:\n  - repo: test\n    path: test\n    type: skill\n`);
    expect(() => loadCatalog(catalogFile)).toThrow("missing or invalid 'name'");
  });

  it("rejects invalid resource types", () => {
    writeFileSync(catalogFile, `entries:\n  - name: test\n    repo: test\n    path: test\n    type: invalid\n`);
    expect(() => loadCatalog(catalogFile)).toThrow("invalid type");
  });
});

describe("saveCatalog", () => {
  it("writes catalog organized by type sections", () => {
    const catalog: Catalog = { entries: [sampleEntry] };
    saveCatalog(catalog, catalogFile);
    expect(existsSync(catalogFile)).toBe(true);

    // Re-read and verify
    const loaded = loadCatalog(catalogFile);
    expect(loaded.entries).toHaveLength(1);
    expect(loaded.entries[0].name).toBe("recon-methodology");
  });
});

describe("findEntry", () => {
  it("finds entry by name", () => {
    const catalog: Catalog = { entries: [sampleEntry] };
    expect(findEntry(catalog, "recon-methodology")).toEqual(sampleEntry);
  });

  it("returns undefined for missing entry", () => {
    const catalog: Catalog = { entries: [sampleEntry] };
    expect(findEntry(catalog, "nonexistent")).toBeUndefined();
  });
});

describe("addEntry", () => {
  it("adds a new entry", () => {
    const catalog: Catalog = { entries: [] };
    const updated = addEntry(catalog, sampleEntry);
    expect(updated.entries).toHaveLength(1);
  });

  it("throws on duplicate name", () => {
    const catalog: Catalog = { entries: [sampleEntry] };
    expect(() => addEntry(catalog, sampleEntry)).toThrow("already exists");
  });
});

describe("removeEntry", () => {
  it("removes an entry by name", () => {
    const catalog: Catalog = { entries: [sampleEntry] };
    const updated = removeEntry(catalog, "recon-methodology");
    expect(updated.entries).toHaveLength(0);
  });

  it("throws for missing entry", () => {
    const catalog: Catalog = { entries: [] };
    expect(() => removeEntry(catalog, "nonexistent")).toThrow("not found");
  });
});
