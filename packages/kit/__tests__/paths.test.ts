import { describe, it, expect } from "vitest";
import { homedir } from "os";
import { join } from "path";
import { getInstallPath } from "../lib/paths";

const home = homedir();

describe("getInstallPath", () => {
  it("skill installs to ~/.claude/skills/<name>/", () => {
    expect(getInstallPath("recon", "skill")).toBe(
      join(home, ".claude", "skills", "recon"),
    );
  });

  it("command installs to ~/.claude/commands/<name>.md", () => {
    expect(getInstallPath("bash-function", "command")).toBe(
      join(home, ".claude", "commands", "bash-function.md"),
    );
  });

  it("tool installs to ~/.local/bin/<name>", () => {
    expect(getInstallPath("sigil-search", "tool")).toBe(
      join(home, ".local", "bin", "sigil-search"),
    );
  });

  it("agent installs to ~/.claude/agents/<name>.md", () => {
    expect(getInstallPath("ghost", "agent")).toBe(
      join(home, ".claude", "agents", "ghost.md"),
    );
  });

  it("respects --dir for project-scoped install", () => {
    expect(getInstallPath("recon", "skill", undefined, "/tmp/project")).toBe(
      join("/tmp/project", ".claude", "skills", "recon"),
    );
  });

  it("respects config path overrides", () => {
    const config = {
      catalog: { repo: "" },
      paths: { skills: "/custom/skills" },
    };
    expect(getInstallPath("recon", "skill", config)).toBe(
      join("/custom/skills", "recon"),
    );
  });
});
