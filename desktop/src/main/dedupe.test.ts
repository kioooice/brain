import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildFingerprint,
  isDuplicateRecent,
  rememberFingerprint,
  shouldIgnoreText,
} from "./dedupe";

describe("dedupe", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-30T00:00:00.000Z"));
  });

  it("ignores empty, short, numeric, code-like, and secret-like text", () => {
    expect(shouldIgnoreText("")).toBe(true);
    expect(shouldIgnoreText("short")).toBe(true);
    expect(shouldIgnoreText("1234567890")).toBe(true);
    expect(shouldIgnoreText("A7K9P2")).toBe(true);
    expect(shouldIgnoreText("sk-1234567890abcdefghijklmnopqrstuvwxyz")).toBe(true);
    expect(shouldIgnoreText("https://example.com/callback?token=secret-value")).toBe(true);
    expect(shouldIgnoreText("Useful note with enough context")).toBe(false);
    expect(shouldIgnoreText("https://example.com/a")).toBe(false);
  });

  it("builds the same URL fingerprint after removing tracking parameters", () => {
    const clean = buildFingerprint("text", "https://example.com/page?id=7#section");
    const tracked = buildFingerprint(
      "text",
      "https://example.com/page?utm_source=chatgpt&spm=a1z&from=share&id=7&share=copy#section"
    );

    expect(tracked).toBe(clean);
  });

  it("treats matching fingerprints as recent duplicates for ten seconds", () => {
    const fingerprint = buildFingerprint("text", "Useful note with enough context");

    expect(isDuplicateRecent(fingerprint)).toBe(false);
    rememberFingerprint(fingerprint);
    expect(isDuplicateRecent(fingerprint)).toBe(true);

    vi.advanceTimersByTime(10001);

    expect(isDuplicateRecent(fingerprint)).toBe(false);
  });
});
