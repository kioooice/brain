import { afterEach, describe, expect, it, vi } from "vitest";
import type { DesktopStore } from "./store";

const electronMocks = vi.hoisted(() => ({
  getPath: vi.fn(() => "C:\\mock-user-data"),
}));

vi.mock("electron", () => ({
  app: {
    getPath: electronMocks.getPath,
  },
}));

import { suggestAiOrganization } from "./ai-organizer";

const baseSnapshot = {
  boxes: [
    { id: 1, name: "默认", color: "#f97316", description: "", sortOrder: 0 },
    { id: 2, name: "AI", color: "#2563eb", description: "", sortOrder: 1 },
  ],
  items: [
    {
      id: 11,
      boxId: 1,
      kind: "text" as const,
      title: "note",
      content: "整理一下模型路由和提示词策略",
      sourceUrl: "",
      sourcePath: "",
      bundleCount: 0,
      sortOrder: 0,
      createdAt: "2026-04-08T00:00:00.000Z",
      updatedAt: "2026-04-08T00:00:00.000Z",
    },
  ],
  panelState: { selectedBoxId: 1 },
};

function createStoreDouble(): DesktopStore {
  return {
    getWorkbenchSnapshot: vi.fn(() => baseSnapshot),
    getNotepadSnapshot: vi.fn(),
    createNotepadGroup: vi.fn(),
    createNotepadNote: vi.fn(),
    captureTextOrLink: vi.fn(),
    captureTextOrLinkIntoBox: vi.fn(),
    captureImageData: vi.fn(),
    captureImageDataIntoBox: vi.fn(),
    captureDroppedPaths: vi.fn(),
    captureDroppedPathsIntoBox: vi.fn(),
    createBox: vi.fn(),
    updateBox: vi.fn(),
    reorderBox: vi.fn(),
    deleteBox: vi.fn(),
    clearBoxItems: vi.fn(),
    deleteItem: vi.fn(),
    updateItemTitle: vi.fn(),
    removeBundleEntry: vi.fn(),
    groupItems: vi.fn(),
    moveItemToBox: vi.fn(),
    moveItemToIndex: vi.fn(),
    reorderItem: vi.fn(),
    applyAiOrganization: vi.fn(),
    selectBox: vi.fn(),
    getBundleEntries: vi.fn(),
    updateLinkTitle: vi.fn(),
    close: vi.fn(),
  };
}

describe("suggestAiOrganization", () => {
  const originalApiKey = process.env.DEEPSEEK_API_KEY;
  const originalModel = process.env.DEEPSEEK_MODEL;
  const originalBaseUrl = process.env.DEEPSEEK_BASE_URL;

  afterEach(() => {
    if (originalApiKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalApiKey;
    if (originalModel === undefined) delete process.env.DEEPSEEK_MODEL;
    else process.env.DEEPSEEK_MODEL = originalModel;
    if (originalBaseUrl === undefined) delete process.env.DEEPSEEK_BASE_URL;
    else process.env.DEEPSEEK_BASE_URL = originalBaseUrl;
    vi.restoreAllMocks();
  });

  it("returns a readable error when the API key is missing", async () => {
    delete process.env.DEEPSEEK_API_KEY;

    const result = await suggestAiOrganization(createStoreDouble(), 1);

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("DeepSeek API Key");
    expect(result.suggestions).toEqual([]);
  });

  it("normalizes AI suggestions against existing boxes and source items", async () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                suggestions: [
                  {
                    itemId: 11,
                    suggestedTitle: "模型路由策略",
                    targetBoxName: "AI",
                    confidence: 0.9,
                    reason: "内容提到模型和提示词",
                  },
                  {
                    itemId: 999,
                    suggestedTitle: "不存在",
                    targetBoxName: "杂项",
                    confidence: 0.3,
                    reason: "应该被忽略",
                  },
                ],
              }),
            },
          },
        ],
      }),
    } as Response);

    const result = await suggestAiOrganization(createStoreDouble(), 1);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.deepseek.com/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-key" }),
      })
    );
    expect(result.ok).toBe(true);
    expect(result.suggestions).toEqual([
      expect.objectContaining({
        itemId: 11,
        suggestedTitle: "模型路由策略",
        targetBoxId: 2,
        targetBoxName: "AI",
        createBox: false,
      }),
    ]);
  });

  it("redacts the API key from provider error messages", async () => {
    process.env.DEEPSEEK_API_KEY = "test-key-secret";
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "invalid Authorization: Bearer test-key-secret",
    } as Response);

    const result = await suggestAiOrganization(createStoreDouble(), 1);

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("401");
    expect(result.reason).not.toContain("test-key-secret");
    expect(result.reason).toContain("[redacted-secret]");
  });
});
