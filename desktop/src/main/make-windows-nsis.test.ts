import { afterEach, describe, expect, it, vi } from "vitest";
import { makeWindowsNsis } from "../../scripts/make-windows-nsis.js";

const originalPlatform = process.platform;

afterEach(() => {
  Object.defineProperty(process, "platform", {
    configurable: true,
    value: originalPlatform,
  });
  vi.clearAllMocks();
});

describe("makeWindowsNsis", () => {
  it("packages with Forge before building an NSIS exe installer", () => {
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "win32",
    });

    const execFileSync = vi.fn();
    const existsSync = vi.fn((path: string) => path.endsWith("Brain Desktop-win32-x64"));
    const logger = vi.fn();

    makeWindowsNsis({
      projectDir: "D:\\02-Projects\\brain\\desktop",
      workspaceDir: "D:\\02-Projects\\brain",
      existsSync,
      execFileSync,
      logger,
    });

    expect(execFileSync).toHaveBeenCalledWith(
      process.execPath,
      [
        "D:\\02-Projects\\brain\\desktop\\node_modules\\@electron-forge\\cli\\dist\\electron-forge.js",
        "package",
        "--platform=win32",
        "--arch=x64",
      ],
      {
        cwd: "D:\\02-Projects\\brain\\desktop",
        stdio: "inherit",
      }
    );
    expect(execFileSync).toHaveBeenCalledWith(
      process.execPath,
      [
        "D:\\02-Projects\\brain\\desktop\\node_modules\\electron-builder\\cli.js",
        "--win",
        "nsis",
        "--x64",
        "--prepackaged",
        "D:\\02-Projects\\brain\\.desktop-out\\Brain Desktop-win32-x64",
        "--config",
        "D:\\02-Projects\\brain\\desktop\\electron-builder.json",
      ],
      {
        cwd: "D:\\02-Projects\\brain\\desktop",
        stdio: "inherit",
      }
    );
  });

  it("fails fast outside Windows", () => {
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "linux",
    });

    expect(() => makeWindowsNsis()).toThrow("NSIS exe installer can only be built on Windows.");
  });
});
