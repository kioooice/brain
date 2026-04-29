import { afterEach, describe, expect, it, vi } from "vitest";
import { clearWindowsReadOnlyAttributes } from "../../scripts/windows-attribute-utils.js";

const originalPlatform = process.platform;

afterEach(() => {
  Object.defineProperty(process, "platform", {
    configurable: true,
    value: originalPlatform,
  });
});

describe("clearWindowsReadOnlyAttributes", () => {
  it("clears read-only attributes recursively on Windows", () => {
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "win32",
    });

    const execFileSync = vi.fn();

    clearWindowsReadOnlyAttributes("D:\\02-Projects\\brain\\.desktop-out\\Brain Desktop-win32-x64\\resources\\app", {
      execFileSync,
    });

    expect(execFileSync).toHaveBeenCalledWith(
      "attrib",
      ["-R", "D:\\02-Projects\\brain\\.desktop-out\\Brain Desktop-win32-x64\\resources\\app", "/S", "/D"],
      { stdio: "ignore" }
    );
  });

  it("does nothing outside Windows", () => {
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "linux",
    });

    const execFileSync = vi.fn();

    clearWindowsReadOnlyAttributes("D:\\02-Projects\\brain\\.desktop-out\\Brain Desktop-win32-x64\\resources\\app", {
      execFileSync,
    });

    expect(execFileSync).not.toHaveBeenCalled();
  });
});
