import { describe, expect, it, vi } from "vitest";

const childProcessMocks = vi.hoisted(() => ({
  execFile: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: childProcessMocks.execFile,
  default: childProcessMocks,
}));

import { runWindowsOcr } from "./windows-ocr";

describe("runWindowsOcr", () => {
  it("runs the built-in Windows OCR command and returns recognized text", async () => {
    childProcessMocks.execFile.mockImplementation((_command, _args, _options, callback) => {
      callback(null, "识别文字\nsecond line", "");
    });

    const result = await runWindowsOcr("C:\\brain\\auto-captures\\shot.png");

    expect(childProcessMocks.execFile).toHaveBeenCalledWith(
      "powershell.exe",
      expect.arrayContaining(["-EncodedCommand"]),
      expect.objectContaining({
        env: expect.objectContaining({
          BRAIN_OCR_IMAGE_PATH: "C:\\brain\\auto-captures\\shot.png",
        }),
        windowsHide: true,
      }),
      expect.any(Function)
    );
    expect(result).toEqual({
      text: "识别文字\nsecond line",
      available: true,
      status: "Windows OCR 已启用",
    });
  });

  it("keeps capture usable when Windows OCR is unavailable", async () => {
    childProcessMocks.execFile.mockImplementation((_command, _args, _options, callback) => {
      callback(new Error("Windows OCR unavailable"), "", "failed");
    });

    const result = await runWindowsOcr("C:\\brain\\auto-captures\\shot.png");

    expect(result).toEqual({
      text: "",
      available: false,
      status: "Windows OCR 不可用，已先保存图片",
    });
  });
});
