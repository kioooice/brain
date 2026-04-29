import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareWebpackStart } from "../../scripts/prepare-start.js";

const originalPlatform = process.platform;

afterEach(() => {
  Object.defineProperty(process, "platform", {
    configurable: true,
    value: originalPlatform,
  });
});

describe("prepareWebpackStart", () => {
  it("clears stale webpack output before npm start on Windows", () => {
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "win32",
    });

    const existsSync = vi.fn().mockReturnValue(true);
    const execFileSync = vi.fn();
    const rmSync = vi.fn();

    const removed = prepareWebpackStart({
      projectDir: "D:\\02-Projects\\brain\\desktop",
      existsSync,
      execFileSync,
      rmSync,
    });

    expect(removed).toBe(true);
    expect(execFileSync).toHaveBeenCalledWith(
      "attrib",
      ["-R", "D:\\02-Projects\\brain\\desktop\\.webpack", "/S", "/D"],
      { stdio: "ignore" }
    );
    expect(execFileSync).toHaveBeenCalledWith(
      "attrib",
      ["-R", "D:\\02-Projects\\brain\\desktop\\out", "/S", "/D"],
      { stdio: "ignore" }
    );
    expect(rmSync).toHaveBeenNthCalledWith(1, "D:\\02-Projects\\brain\\desktop\\.webpack", {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
    expect(rmSync).toHaveBeenNthCalledWith(2, "D:\\02-Projects\\brain\\desktop\\out", {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
    expect(rmSync).toHaveBeenNthCalledWith(3, "D:\\02-Projects\\brain\\.desktop-out", {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  });

  it("skips cleanup when no webpack output exists", () => {
    const existsSync = vi.fn().mockReturnValue(false);
    const execFileSync = vi.fn();
    const rmSync = vi.fn();

    const removed = prepareWebpackStart({
      projectDir: "D:\\02-Projects\\brain\\desktop",
      existsSync,
      execFileSync,
      rmSync,
    });

    expect(removed).toBe(false);
    expect(execFileSync).not.toHaveBeenCalled();
    expect(rmSync).not.toHaveBeenCalled();
  });
});
