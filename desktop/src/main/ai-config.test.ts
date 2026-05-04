import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const electronMocks = vi.hoisted(() => {
  const state = { userDataPath: "" };
  return {
    state,
    getPath: vi.fn(() => state.userDataPath),
  };
});

vi.mock("electron", () => ({
  app: {
    getPath: electronMocks.getPath,
  },
}));

import {
  getAiProviderConfigStatus,
  readAiProviderConfig,
  saveAiProviderConfig,
  testAiProviderConnection,
} from "./ai-config";

describe("AI provider config", () => {
  const originalApiKey = process.env.DEEPSEEK_API_KEY;
  const originalModel = process.env.DEEPSEEK_MODEL;
  const originalBaseUrl = process.env.DEEPSEEK_BASE_URL;

  beforeEach(() => {
    electronMocks.state.userDataPath = mkdtempSync(join(tmpdir(), "brain-ai-config-"));
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_MODEL;
    delete process.env.DEEPSEEK_BASE_URL;
  });

  afterEach(() => {
    rmSync(electronMocks.state.userDataPath, { recursive: true, force: true });
    if (originalApiKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalApiKey;
    if (originalModel === undefined) delete process.env.DEEPSEEK_MODEL;
    else process.env.DEEPSEEK_MODEL = originalModel;
    if (originalBaseUrl === undefined) delete process.env.DEEPSEEK_BASE_URL;
    else process.env.DEEPSEEK_BASE_URL = originalBaseUrl;
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("uses DeepSeek defaults and hides the full API key from status", () => {
    process.env.DEEPSEEK_API_KEY = "sk-test-123456";

    const fullConfig = readAiProviderConfig();
    const status = getAiProviderConfigStatus();

    expect(fullConfig).toMatchObject({
      provider: "deepseek",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
      apiKey: "sk-test-123456",
    });
    expect(status).toEqual({
      provider: "deepseek",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
      apiKeyConfigured: true,
      apiKeyPreview: "sk-...3456",
    });
  });

  it("saves local DeepSeek config and preserves an existing key when left blank", () => {
    const saved = saveAiProviderConfig({
      baseUrl: "https://api.deepseek.com/v1",
      model: "deepseek-v4-flash",
      apiKey: "sk-local-abcdef",
    });

    expect(saved.apiKeyPreview).toBe("sk-...cdef");

    const updated = saveAiProviderConfig({
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-pro",
    });

    expect(updated).toMatchObject({
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-pro",
      apiKeyConfigured: true,
      apiKeyPreview: "sk-...cdef",
    });
  });

  it("clears a saved DeepSeek API key on request", () => {
    saveAiProviderConfig({
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
      apiKey: "sk-local-abcdef",
    });

    const cleared = saveAiProviderConfig({
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
      clearApiKey: true,
    });

    expect(cleared.apiKeyConfigured).toBe(false);
    expect(readAiProviderConfig().apiKey).toBe("");
  });

  it("tests a DeepSeek connection with the draft config without exposing the key", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "pong" } }] }),
    } as Response);

    const result = await testAiProviderConnection({
      baseUrl: "https://api.deepseek.com/v1",
      model: "deepseek-v4-flash",
      apiKey: "sk-test-connection",
    });

    expect(result).toEqual({
      ok: true,
      reason: "DeepSeek 连接正常。",
      model: "deepseek-v4-flash",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.deepseek.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer sk-test-connection" }),
      })
    );
  });

  it("redacts API keys from DeepSeek connection test failures", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "invalid key sk-test-connection",
    } as Response);

    const result = await testAiProviderConnection({
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
      apiKey: "sk-test-connection",
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("401");
    expect(result.reason).not.toContain("sk-test-connection");
    expect(result.reason).not.toContain("[redacted-secret]");
    expect(result.reason).toBe("DeepSeek 连接失败：401，API Key 无效或已过期，请重新填写。");
  });

  it("summarizes long DeepSeek error payloads without exposing raw JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 400,
      text: async () =>
        JSON.stringify({
          error: {
            message: "This request has a very long upstream payload that should not spill into the UI.",
            type: "invalid_request_error",
            code: "bad_request",
          },
        }),
    } as Response);

    const result = await testAiProviderConnection({
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
      apiKey: "sk-test-connection",
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("DeepSeek 连接失败：400，bad_request。");
    expect(result.reason).not.toContain("{");
  });
});
