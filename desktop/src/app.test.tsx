import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./app";
import type { WorkbenchSnapshot } from "./shared/types";

const electronMocks = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
  removeListener: vi.fn(),
  getPathForFile: vi.fn((file: File) => `C:\\mock\\${file.name}`),
}));

const initialSnapshot: WorkbenchSnapshot = {
  boxes: [{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }],
  items: [],
  panelState: { selectedBoxId: 1 },
};

function createFileDropEvent(type: string, paths: string[]) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as Event & {
    dataTransfer?: {
      files: Array<{ path: string }>;
      getData(type: string): string;
    };
  };
  Object.defineProperty(event, "dataTransfer", {
    value: {
      files: paths.map((path) => ({ path })),
      getData: () => "",
    },
  });
  return event;
}

function createDataTransfer() {
  const store = new Map<string, string>();
  return {
    dropEffect: "move",
    effectAllowed: "move",
    files: [] as Array<{ path: string }>,
    setData(type: string, value: string) {
      store.set(type, value);
    },
    getData(type: string) {
      return store.get(type) ?? "";
    },
  };
}

function createDragEvent(type: string, dataTransfer: ReturnType<typeof createDataTransfer>) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as Event & {
    dataTransfer?: ReturnType<typeof createDataTransfer>;
  };
  Object.defineProperty(event, "dataTransfer", {
    value: dataTransfer,
  });
  return event;
}

vi.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld: electronMocks.exposeInMainWorld,
  },
  ipcRenderer: {
    invoke: electronMocks.invoke,
    on: electronMocks.on,
    removeListener: electronMocks.removeListener,
  },
  webUtils: {
    getPathForFile: electronMocks.getPathForFile,
  },
}));

beforeEach(() => {
  vi.useRealTimers();
  window.brainDesktop = {
    bootstrap: vi.fn().mockResolvedValue(initialSnapshot),
    getNotepadSnapshot: vi.fn().mockResolvedValue({
      groups: [{ id: 1, name: "默认", sortOrder: 0, createdAt: "", updatedAt: "" }],
      notes: [],
    }),
    createNotepadGroup: vi.fn(),
    createNotepadNote: vi.fn(),
    getAutoCaptureSnapshot: vi.fn().mockResolvedValue({
      entries: [],
      running: false,
      paused: true,
      pauseReason: "manual",
      intervalMs: 60000,
      lastError: "",
      ocrAvailable: false,
      ocrStatus: "等待首次识别",
    }),
    startAutoCapture: vi.fn(),
    stopAutoCapture: vi.fn(),
    pauseAutoCaptureForPrivacy: vi.fn(),
    captureDesktopNow: vi.fn(),
    searchAutoCaptures: vi.fn(),
    deleteAutoCaptureEntry: vi.fn(),
    clearAutoCaptures: vi.fn(),
    onAutoCaptureChanged: vi.fn(),
    getStorageUsage: vi.fn().mockResolvedValue({
      databaseBytes: 0,
      imageBytes: 0,
      thumbnailBytes: 0,
      autoCaptureBytes: 0,
      totalBytes: 0,
    }),
    cleanupExpiredAutoCaptures: vi.fn(),
    cleanupOrphanedStorageFiles: vi.fn(),
    searchLocal: vi.fn().mockResolvedValue({ query: "", results: [] }),
    captureClipboardNow: vi.fn(),
    setClipboardWatcherEnabled: vi.fn(),
    getClipboardWatcherStatus: vi.fn().mockResolvedValue({ running: false }),
    setClipboardCaptureBox: vi.fn().mockResolvedValue({ boxId: 1, boxName: "Inbox" }),
    getClipboardCaptureBox: vi.fn().mockResolvedValue({ boxId: 1, boxName: "Inbox" }),
    getPathsForFiles: vi.fn((files: File[]) => files.map((file) => `C:\\mock\\${file.name}`)),
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
    openPath: vi.fn(),
    openExternal: vi.fn(),
    copyText: vi.fn(),
    exportBundleAi: vi.fn(),
    groupItems: vi.fn(),
    suggestAiOrganization: vi.fn(),
    applyAiOrganization: vi.fn(),
    getAiProviderConfig: vi.fn().mockResolvedValue({
      provider: "deepseek",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
      apiKeyConfigured: false,
      apiKeyPreview: "",
    }),
    saveAiProviderConfig: vi.fn(),
    testAiProviderConnection: vi.fn(),
    moveItemToBox: vi.fn(),
    moveItemToIndex: vi.fn(),
    reorderItem: vi.fn(),
    selectBox: vi.fn().mockResolvedValue(initialSnapshot),
    getBundleEntries: vi.fn(),
    enrichLinkTitle: vi.fn(),
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("App", () => {
  it("shows the loading shell before bootstrap resolves", () => {
    render(<App />);
    expect(screen.getByText("正在加载 Brain Desktop...")).toBeInTheDocument();
  });

  it("loads the first box name from bootstrap", async () => {
    render(<App />);
    expect(await screen.findByRole("button", { name: "打开盒子 Inbox" })).toBeInTheDocument();
  });

  it("redacts API keys from AI config error toasts", async () => {
    const saveAiProviderConfig = vi
      .fn()
      .mockRejectedValue(new Error("failed to save sk-secret-value"));

    window.brainDesktop = {
      ...window.brainDesktop,
      saveAiProviderConfig,
    };

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "打开关于" }));
    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "sk-secret-value" } });
    fireEvent.click(screen.getByRole("button", { name: "保存 API" }));

    expect(await screen.findByText("failed to save [redacted-secret]")).toBeInTheDocument();
    expect(screen.queryByText(/sk-secret-value/)).not.toBeInTheDocument();
  });

  it("shows DeepSeek connection test results without saving the draft key", async () => {
    const testAiProviderConnection = vi.fn().mockResolvedValue({
      ok: true,
      reason: "DeepSeek 连接正常。",
      model: "deepseek-v4-flash",
    });

    window.brainDesktop = {
      ...window.brainDesktop,
      testAiProviderConnection,
    };

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "打开关于" }));
    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "sk-draft" } });
    fireEvent.click(screen.getByRole("button", { name: "测试连接" }));

    await screen.findByText("DeepSeek 连接正常。");
    expect(testAiProviderConnection).toHaveBeenCalledWith({
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
      apiKey: "sk-draft",
    });
    expect(window.brainDesktop.saveAiProviderConfig).not.toHaveBeenCalled();
  });

  it("loads storage usage and runs storage cleanup from settings", async () => {
    const getStorageUsage = vi.fn().mockResolvedValue({
      databaseBytes: 1024 * 1024,
      imageBytes: 2 * 1024 * 1024,
      thumbnailBytes: 512 * 1024,
      autoCaptureBytes: 4 * 1024 * 1024,
      totalBytes: 7.5 * 1024 * 1024,
    });
    const cleanupOrphanedStorageFiles = vi.fn().mockResolvedValue({
      usage: {
        databaseBytes: 1024 * 1024,
        imageBytes: 1024 * 1024,
        thumbnailBytes: 0,
        autoCaptureBytes: 4 * 1024 * 1024,
        totalBytes: 6 * 1024 * 1024,
      },
      removedFiles: 2,
      removedBytes: 1.5 * 1024 * 1024,
    });
    window.brainDesktop = {
      ...window.brainDesktop,
      getStorageUsage,
      cleanupOrphanedStorageFiles,
    };

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "打开设置" }));
    expect(await screen.findByLabelText("本地占用合计")).toHaveTextContent("7.5 MB");
    fireEvent.click(screen.getByRole("button", { name: "清理无引用图片" }));

    await waitFor(() => expect(cleanupOrphanedStorageFiles).toHaveBeenCalledTimes(1));
    expect(await screen.findByLabelText("本地占用合计")).toHaveTextContent("6 MB");
    expect(await screen.findByText("已清理 2 个文件")).toBeInTheDocument();
  });

  it("searches local backend results from the global search field", async () => {
    const searchLocal = vi.fn().mockResolvedValue({
      query: "预算",
      results: [
        {
          id: "auto-capture:7",
          source: "autoCapture",
          title: "自动记录 05/04 11:10",
          preview: "发票 金额 预 算",
          createdAt: "2026-05-04T03:10:00.000Z",
          entry: {
            id: 7,
            imagePath: "C:\\brain\\auto-captures\\budget.jpg",
            imageUrl: "data:image/png;base64,YnVkZ2V0",
            thumbnailUrl: "data:image/jpeg;base64,YnVkZ2V0LXRodW1i",
            ocrText: "发票 金额 预 算",
            createdAt: "2026-05-04T03:10:00.000Z",
          },
        },
      ],
    });
    window.brainDesktop = {
      ...window.brainDesktop,
      searchLocal,
    };

    render(<App />);

    fireEvent.change(await screen.findByLabelText("全局搜索"), { target: { value: "预算" } });

    await waitFor(() => expect(searchLocal).toHaveBeenCalledWith("预算", 8));
    expect(await screen.findByRole("button", { name: "打开搜索结果 自动记录 05/04 11:10，位于 自动记录" })).toBeInTheDocument();
  });

  it("captures a text note from workspace paste", async () => {
    const captureTextOrLinkIntoBox = vi.fn().mockResolvedValue({
      ...initialSnapshot,
      items: [
        {
          id: 2,
          boxId: 1,
          kind: "text",
          title: "Quick note",
          content: "Quick note",
          sourceUrl: "",
          sourcePath: "",
          bundleCount: 0,
          sortOrder: 0,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        },
      ],
    });

    window.brainDesktop = {
      ...window.brainDesktop,
      captureTextOrLinkIntoBox,
    };

    render(<App />);

    fireEvent.paste(await screen.findByLabelText("工作区拖放区"), {
      clipboardData: {
        getData: (type: string) => (type === "text" ? "Quick note" : ""),
      },
    });

    await waitFor(() => expect(captureTextOrLinkIntoBox).toHaveBeenCalledWith("Quick note", 1));
    expect((await screen.findAllByText("Quick note")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("已收集到 Inbox")).length).toBeGreaterThan(0);
  });

  it("captures a notepad idea into a standalone notepad group", async () => {
    const baseSnapshot: WorkbenchSnapshot = {
      boxes: [
        { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
        { id: 2, name: "Ideas", color: "#2563eb", description: "", sortOrder: 1 },
      ],
      items: [],
      panelState: { selectedBoxId: 2 },
    };
    const notepadSnapshot = {
      groups: [{ id: 11, name: "默认", sortOrder: 0, createdAt: "", updatedAt: "" }],
      notes: [],
    };
    const savedNotepadSnapshot = {
      ...notepadSnapshot,
      notes: [
        {
          id: 21,
          groupId: 11,
          content: "Notepad idea",
          sortOrder: 0,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        },
      ],
    };
    const createNotepadNote = vi.fn().mockResolvedValue(savedNotepadSnapshot);
    const captureTextOrLinkIntoBox = vi.fn();

    window.brainDesktop = {
      ...window.brainDesktop,
      bootstrap: vi.fn().mockResolvedValue(baseSnapshot),
      getNotepadSnapshot: vi.fn().mockResolvedValue(notepadSnapshot),
      setClipboardCaptureBox: vi.fn().mockResolvedValue({ boxId: 1, boxName: "Inbox" }),
      createNotepadNote,
      captureTextOrLinkIntoBox,
    };

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "打开记事本" }));
    fireEvent.change(screen.getByLabelText("记事本内容"), { target: { value: "Notepad idea" } });
    fireEvent.click(screen.getByRole("button", { name: "保存想法" }));

    await waitFor(() => expect(createNotepadNote).toHaveBeenCalledWith(11, "Notepad idea"));
    expect(captureTextOrLinkIntoBox).not.toHaveBeenCalled();
    expect(await screen.findByText("已保存到记事本：默认")).toBeInTheDocument();
    expect(await screen.findByText("Notepad idea")).toBeInTheDocument();
  });

  it("updates the workspace when the clipboard watcher captures content in the background", async () => {
    let clipboardCaptureHandler: ((result: unknown) => void) | null = null;
    const unsubscribe = vi.fn();
    const watcherSnapshot: WorkbenchSnapshot = {
      ...initialSnapshot,
      items: [
        {
          id: 14,
          boxId: 1,
          kind: "text",
          title: "Watcher note",
          content: "Watcher note",
          sourceUrl: "",
          sourcePath: "",
          bundleCount: 0,
          sortOrder: 0,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        },
      ],
    };

    window.brainDesktop = {
      ...window.brainDesktop,
      onClipboardCapture: vi.fn((handler) => {
        clipboardCaptureHandler = handler;
        return unsubscribe;
      }),
    };

    render(<App />);

    await screen.findByLabelText("工作区拖放区");
    expect(window.brainDesktop.onClipboardCapture).toHaveBeenCalledTimes(1);

    await act(async () => {
      clipboardCaptureHandler?.({
        captured: true,
        kind: "text",
        reason: "已收集剪贴板",
        snapshot: watcherSnapshot,
      });
    });

    expect(await screen.findByText("Watcher note")).toBeInTheDocument();
    expect(screen.getByLabelText("自动监听详情")).toHaveTextContent("进入 最近添加");
    expect(screen.queryByLabelText("最近收集")).not.toBeInTheDocument();
  });

  it("shows a skipped duplicate message when paste does not create a new card", async () => {
    const captureTextOrLinkIntoBox = vi.fn().mockResolvedValue(initialSnapshot);

    window.brainDesktop = {
      ...window.brainDesktop,
      captureTextOrLinkIntoBox,
    };

    render(<App />);

    fireEvent.paste(await screen.findByLabelText("工作区拖放区"), {
      clipboardData: {
        getData: (type: string) => (type === "text" ? "Repeated note" : ""),
      },
    });

    await waitFor(() => expect(captureTextOrLinkIntoBox).toHaveBeenCalledWith("Repeated note", 1));
    expect((await screen.findAllByText("重复内容，已跳过")).length).toBeGreaterThan(0);
  });

  it("captures workspace paste only once", async () => {
    const captureTextOrLinkIntoBox = vi.fn().mockResolvedValue({
      ...initialSnapshot,
      items: [
        {
          id: 201,
          boxId: 1,
          kind: "text",
          title: "Once",
          content: "Once",
          sourceUrl: "",
          sourcePath: "",
          bundleCount: 0,
          sortOrder: 0,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        },
      ],
    });

    window.brainDesktop = {
      ...window.brainDesktop,
      captureTextOrLinkIntoBox,
    };

    render(<App />);

    fireEvent.paste(await screen.findByLabelText("工作区拖放区"), {
      clipboardData: {
        getData: (type: string) => (type === "text" ? "Once" : ""),
        items: [],
        files: [],
      },
    });

    await waitFor(() => expect(captureTextOrLinkIntoBox).toHaveBeenCalledTimes(1));
  });

  it("refreshes a link title after enrichment", async () => {
    const captureTextOrLinkIntoBox = vi.fn().mockResolvedValue({
      ...initialSnapshot,
      items: [
        {
          id: 3,
          boxId: 1,
          kind: "link",
          title: "https://example.com",
          content: "https://example.com",
          sourceUrl: "https://example.com",
          sourcePath: "",
          bundleCount: 0,
          sortOrder: 0,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        },
      ],
    });
    const enrichLinkTitle = vi.fn().mockResolvedValue({
      ...initialSnapshot,
      items: [
        {
          id: 3,
          boxId: 1,
          kind: "link",
          title: "Example Domain",
          content: "https://example.com",
          sourceUrl: "https://example.com",
          sourcePath: "",
          bundleCount: 0,
          sortOrder: 0,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:01.000Z",
        },
      ],
    });

    window.brainDesktop = {
      ...window.brainDesktop,
      captureTextOrLinkIntoBox,
      enrichLinkTitle,
    };

    render(<App />);

    fireEvent.paste(await screen.findByLabelText("工作区拖放区"), {
      clipboardData: {
        getData: (type: string) => (type === "text" ? "https://example.com" : ""),
      },
    });

    await waitFor(() => expect(captureTextOrLinkIntoBox).toHaveBeenCalledWith("https://example.com", 1));
    await waitFor(() => expect(enrichLinkTitle).toHaveBeenCalledWith(3, "https://example.com"));
    expect((await screen.findAllByText("Example Domain")).length).toBeGreaterThan(0);
  });

  it("captures dropped files into recent additions", async () => {
    const captureDroppedPathsIntoBox = vi.fn().mockResolvedValue({
      ...initialSnapshot,
      items: [
        {
          id: 10,
          boxId: 1,
          kind: "file",
          title: "hero.png",
          content: "C:\\assets\\hero.png",
          sourceUrl: "",
          sourcePath: "C:\\assets\\hero.png",
          bundleCount: 0,
          sortOrder: 0,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        },
      ],
    });

    window.brainDesktop = {
      ...window.brainDesktop,
      captureDroppedPathsIntoBox,
    };

    render(<App />);

    fireEvent(
      await screen.findByLabelText("工作区拖放区"),
      createFileDropEvent("drop", ["C:\\assets\\hero.png"])
    );

    await waitFor(() => expect(captureDroppedPathsIntoBox).toHaveBeenCalledWith(["C:\\assets\\hero.png"], 1));
    expect((await screen.findAllByText("hero.png")).length).toBeGreaterThan(0);
  });

  it("reports how many files were collected from a multi-file drop", async () => {
    const droppedPaths = ["C:\\assets\\hero.png", "C:\\assets\\detail.png"];
    const captureDroppedPathsIntoBox = vi.fn().mockResolvedValue({
      ...initialSnapshot,
      items: [
        {
          id: 10,
          boxId: 1,
          kind: "bundle",
          title: "拖入组合",
          content: "2 个项目",
          sourceUrl: "",
          sourcePath: "",
          bundleCount: 2,
          sortOrder: 0,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        },
      ],
    });

    window.brainDesktop = {
      ...window.brainDesktop,
      captureDroppedPathsIntoBox,
    };

    render(<App />);

    fireEvent(await screen.findByLabelText("工作区拖放区"), createFileDropEvent("drop", droppedPaths));

    await waitFor(() => expect(captureDroppedPathsIntoBox).toHaveBeenCalledWith(droppedPaths, 1));
    expect((await screen.findAllByText("已收集 2 个到 Inbox")).length).toBeGreaterThan(0);
  });

  it("reports how many files were skipped from a duplicate multi-file drop", async () => {
    const droppedPaths = ["C:\\assets\\hero.png", "C:\\assets\\detail.png"];
    const captureDroppedPathsIntoBox = vi.fn().mockResolvedValue(initialSnapshot);

    window.brainDesktop = {
      ...window.brainDesktop,
      captureDroppedPathsIntoBox,
    };

    render(<App />);

    fireEvent(await screen.findByLabelText("工作区拖放区"), createFileDropEvent("drop", droppedPaths));

    await waitFor(() => expect(captureDroppedPathsIntoBox).toHaveBeenCalledWith(droppedPaths, 1));
    expect((await screen.findAllByText("重复内容，已跳过 2 个")).length).toBeGreaterThan(0);
  });

  it("reports collected and skipped counts from a mixed multi-file drop", async () => {
    const droppedPaths = ["C:\\assets\\hero.png", "C:\\assets\\detail.png", "C:\\assets\\notes.pdf"];
    const captureDroppedPathsIntoBox = vi.fn().mockResolvedValue({
      ...initialSnapshot,
      items: [
        {
          id: 10,
          boxId: 1,
          kind: "bundle",
          title: "拖入组合",
          content: "2 个项目",
          sourceUrl: "",
          sourcePath: "",
          bundleCount: 2,
          sortOrder: 0,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        },
      ],
    });

    window.brainDesktop = {
      ...window.brainDesktop,
      captureDroppedPathsIntoBox,
    };

    render(<App />);

    fireEvent(await screen.findByLabelText("工作区拖放区"), createFileDropEvent("drop", droppedPaths));

    await waitFor(() => expect(captureDroppedPathsIntoBox).toHaveBeenCalledWith(droppedPaths, 1));
    expect((await screen.findAllByText("已收集 2 个到 Inbox，跳过 1 个")).length).toBeGreaterThan(0);
  });

  it.skip("switches the active box when a box pill is clicked", async () => {
    const selectedSnapshot: WorkbenchSnapshot = {
      boxes: [
        { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
        { id: 2, name: "Brand", color: "#2563eb", description: "", sortOrder: 1 },
      ],
      items: [
        {
          id: 21,
          boxId: 2,
          kind: "text",
          title: "Brand note",
          content: "Brand note",
          sourceUrl: "",
          sourcePath: "",
          bundleCount: 0,
          sortOrder: 0,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        },
      ],
      panelState: { selectedBoxId: 2 },
    };
    const selectBox = vi.fn().mockResolvedValue(selectedSnapshot);

    window.brainDesktop = {
      ...window.brainDesktop,
      bootstrap: vi.fn().mockResolvedValue({
        boxes: selectedSnapshot.boxes,
        items: [],
        panelState: { selectedBoxId: 1 },
      }),
      selectBox,
    };

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "选择盒子 Brand" }));

    await waitFor(() => expect(selectBox).toHaveBeenCalledWith(2));
    expect((await screen.findAllByText("Brand note")).length).toBeGreaterThan(0);
  });

  it.skip("creates and reorders boxes from the rail", async () => {
    const baseSnapshot: WorkbenchSnapshot = {
      boxes: [
        { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
        { id: 2, name: "Brand", color: "#2563eb", description: "", sortOrder: 1 },
      ],
      items: [],
      panelState: { selectedBoxId: 1 },
    };
    const createBox = vi.fn().mockResolvedValue({
      ...baseSnapshot,
      boxes: [...baseSnapshot.boxes, { id: 3, name: "Visuals", color: "#16a34a", description: "", sortOrder: 2 }],
      panelState: { selectedBoxId: 3 },
    });
    const reorderBox = vi.fn().mockResolvedValue({
      ...baseSnapshot,
      boxes: [
        baseSnapshot.boxes[0],
        { id: 3, name: "Visuals", color: "#16a34a", description: "", sortOrder: 1 },
        { ...baseSnapshot.boxes[1], sortOrder: 2 },
      ],
      panelState: { selectedBoxId: 3 },
    });

    window.brainDesktop = {
      ...window.brainDesktop,
      bootstrap: vi.fn().mockResolvedValue(baseSnapshot),
      createBox,
      reorderBox,
    };

    render(<App />);

    fireEvent.change(await screen.findByLabelText("新盒子名称"), {
      target: { value: "Visuals" },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加盒子" }));
    await waitFor(() => expect(createBox).toHaveBeenCalledWith("Visuals"));

    const dragData = createDataTransfer();
    fireEvent(await screen.findByRole("button", { name: "选择盒子 Visuals" }), createDragEvent("dragstart", dragData));
    fireEvent(screen.getByLabelText("盒子放置位置 2"), createDragEvent("drop", dragData));
    await waitFor(() => expect(reorderBox).toHaveBeenCalledWith(3, "up"));
  });

  it("deletes a box from the trash and reports where its cards were moved", async () => {
    const baseSnapshot: WorkbenchSnapshot = {
      boxes: [
        { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
        { id: 2, name: "Brand", color: "#2563eb", description: "", sortOrder: 1 },
      ],
      items: [
        {
          id: 24,
          boxId: 2,
          kind: "text",
          title: "Brand note",
          content: "Brand note",
          sourceUrl: "",
          sourcePath: "",
          bundleCount: 0,
          sortOrder: 0,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        },
      ],
      panelState: { selectedBoxId: 2 },
    };
    const deleteBox = vi.fn().mockResolvedValue({
      boxes: [baseSnapshot.boxes[0]],
      items: [{ ...baseSnapshot.items[0], boxId: 1 }],
      panelState: { selectedBoxId: 1 },
    });

    window.brainDesktop = {
      ...window.brainDesktop,
      bootstrap: vi.fn().mockResolvedValue(baseSnapshot),
      deleteBox,
    };

    render(<App />);

    const dragData = createDataTransfer();
    dragData.setData("application/x-brain-box-id", "2");
    fireEvent(await screen.findByTestId("rail-trash"), createDragEvent("drop", dragData));

    await waitFor(() => expect(deleteBox).toHaveBeenCalledWith(2));
    expect(await screen.findByText("已删除 Brand，并将 1 张卡片移到 Inbox")).toBeInTheDocument();
    expect((await screen.findAllByText("Brand note")).length).toBeGreaterThan(0);
  });

  it("clears a selected type from the opened box", async () => {
    const baseSnapshot: WorkbenchSnapshot = {
      boxes: [{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }],
      items: [
        {
          id: 41,
          boxId: 1,
          kind: "text",
          title: "Keep note",
          content: "Keep note",
          sourceUrl: "",
          sourcePath: "",
          bundleCount: 0,
          sortOrder: 0,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        },
        {
          id: 42,
          boxId: 1,
          kind: "link",
          title: "https://example.com",
          content: "https://example.com",
          sourceUrl: "https://example.com",
          sourcePath: "",
          bundleCount: 0,
          sortOrder: 1,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        },
      ],
      panelState: { selectedBoxId: 1 },
    };
    const clearedSnapshot = {
      ...baseSnapshot,
      items: [baseSnapshot.items[0]],
    };
    const clearBoxItems = vi.fn().mockResolvedValue(clearedSnapshot);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    window.brainDesktop = {
      ...window.brainDesktop,
      bootstrap: vi.fn().mockResolvedValue(baseSnapshot),
      selectBox: vi.fn().mockResolvedValue(baseSnapshot),
      clearBoxItems,
    };

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "打开盒子 Inbox" }));
    fireEvent.click(await screen.findByRole("button", { name: "批量管理" }));
    fireEvent.change(await screen.findByLabelText("选择清空类型"), { target: { value: "link" } });
    fireEvent.click(screen.getByRole("button", { name: "清空所选类型" }));

    await waitFor(() => expect(clearBoxItems).toHaveBeenCalledWith(1, "link"));
    expect(await screen.findByText("Keep note")).toBeInTheDocument();
    expect(screen.queryByText("https://example.com")).not.toBeInTheDocument();
  });

  it("moves selected cards to another box from batch management", async () => {
    const baseSnapshot: WorkbenchSnapshot = {
      boxes: [
        { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
        { id: 2, name: "Ideas", color: "#2563eb", description: "", sortOrder: 1 },
      ],
      items: [
        {
          id: 41,
          boxId: 1,
          kind: "text",
          title: "First note",
          content: "First note",
          sourceUrl: "",
          sourcePath: "",
          bundleCount: 0,
          sortOrder: 0,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        },
        {
          id: 42,
          boxId: 1,
          kind: "text",
          title: "Second note",
          content: "Second note",
          sourceUrl: "",
          sourcePath: "",
          bundleCount: 0,
          sortOrder: 1,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        },
      ],
      panelState: { selectedBoxId: 1 },
    };
    const movedSnapshot = {
      ...baseSnapshot,
      items: baseSnapshot.items.map((item) => ({ ...item, boxId: 2 })),
    };
    const moveItemToBox = vi.fn().mockResolvedValue(movedSnapshot);

    window.brainDesktop = {
      ...window.brainDesktop,
      bootstrap: vi.fn().mockResolvedValue(baseSnapshot),
      selectBox: vi.fn().mockResolvedValue(baseSnapshot),
      moveItemToBox,
    };

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "打开盒子 Inbox" }));
    fireEvent.click(await screen.findByRole("button", { name: "批量管理" }));
    fireEvent.click(screen.getByRole("button", { name: "选择卡片" }));
    fireEvent.click(screen.getByLabelText("选择卡片 First note"));
    fireEvent.click(screen.getByLabelText("选择卡片 Second note"));
    fireEvent.change(screen.getByLabelText("选择移动目标盒子"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "移动所选卡片" }));

    await waitFor(() => expect(moveItemToBox).toHaveBeenNthCalledWith(1, 41, 2));
    expect(moveItemToBox).toHaveBeenNthCalledWith(2, 42, 2);
    expect(await screen.findByText("已将 2 张卡片移到 Ideas")).toBeInTheDocument();
  });

  it("deletes selected cards from batch management through the existing delete workflow", async () => {
    const baseSnapshot: WorkbenchSnapshot = {
      boxes: [{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }],
      items: [
        {
          id: 41,
          boxId: 1,
          kind: "text",
          title: "First note",
          content: "First note",
          sourceUrl: "",
          sourcePath: "",
          bundleCount: 0,
          sortOrder: 0,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        },
        {
          id: 42,
          boxId: 1,
          kind: "text",
          title: "Second note",
          content: "Second note",
          sourceUrl: "",
          sourcePath: "",
          bundleCount: 0,
          sortOrder: 1,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        },
      ],
      panelState: { selectedBoxId: 1 },
    };
    const deletedSnapshot = {
      ...baseSnapshot,
      items: [],
    };
    const deleteItem = vi.fn().mockResolvedValue(deletedSnapshot);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    window.brainDesktop = {
      ...window.brainDesktop,
      bootstrap: vi.fn().mockResolvedValue(baseSnapshot),
      selectBox: vi.fn().mockResolvedValue(baseSnapshot),
      deleteItem,
    };

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "打开盒子 Inbox" }));
    fireEvent.click(await screen.findByRole("button", { name: "批量管理" }));
    fireEvent.click(screen.getByRole("button", { name: "选择卡片" }));
    fireEvent.click(screen.getByLabelText("选择卡片 First note"));
    fireEvent.click(screen.getByLabelText("选择卡片 Second note"));

    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "删除所选卡片" }));
      await Promise.resolve();
    });

    expect(window.confirm).toHaveBeenCalledWith("确定删除选中的 2 张卡片吗？");
    expect(screen.getByLabelText("工作台通知")).toHaveTextContent("已删除 2 张卡片");
    expect(screen.queryByText("First note")).not.toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });

    expect(deleteItem).toHaveBeenNthCalledWith(1, 41);
    expect(deleteItem).toHaveBeenNthCalledWith(2, 42);
  });

  it.skip("moves a card into another box by dragging onto the box rail", async () => {
    const baseSnapshot: WorkbenchSnapshot = {
      boxes: [
        { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
        { id: 2, name: "Brand", color: "#2563eb", description: "", sortOrder: 1 },
      ],
      items: [
        {
          id: 31,
          boxId: 1,
          kind: "text",
          title: "Inbox note",
          content: "Inbox note",
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
    const moveItemToBox = vi.fn().mockResolvedValue({
      ...baseSnapshot,
      items: [{ ...baseSnapshot.items[0], boxId: 2 }],
    });

    window.brainDesktop = {
      ...window.brainDesktop,
      bootstrap: vi.fn().mockResolvedValue(baseSnapshot),
      moveItemToBox,
    };

    render(<App />);

    const dragData = createDataTransfer();
    fireEvent(await screen.findByLabelText("卡片 Inbox note"), createDragEvent("dragstart", dragData));
    fireEvent(await screen.findByRole("button", { name: "选择盒子 Brand" }), createDragEvent("drop", dragData));

    await waitFor(() => expect(moveItemToBox).toHaveBeenCalledWith(31, 2));
  });

  it.skip("captures dragged text directly into a target box", async () => {
    const baseSnapshot: WorkbenchSnapshot = {
      boxes: [
        { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
        { id: 2, name: "Brand", color: "#2563eb", description: "", sortOrder: 1 },
      ],
      items: [],
      panelState: { selectedBoxId: 1 },
    };
    const captureTextOrLinkIntoBox = vi.fn().mockResolvedValue({
      ...baseSnapshot,
      items: [
        {
          id: 32,
          boxId: 2,
          kind: "text",
          title: "Dragged idea",
          content: "Dragged idea",
          sourceUrl: "",
          sourcePath: "",
          bundleCount: 0,
          sortOrder: 0,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        },
      ],
    });

    window.brainDesktop = {
      ...window.brainDesktop,
      bootstrap: vi.fn().mockResolvedValue(baseSnapshot),
      captureTextOrLinkIntoBox,
    };

    render(<App />);

    const box = await screen.findByRole("button", { name: "选择盒子 Brand" });
    const dropEvent = new Event("drop", { bubbles: true, cancelable: true }) as Event & {
      dataTransfer?: {
        files: unknown[];
        getData(type: string): string;
        types: string[];
      };
    };
    Object.defineProperty(dropEvent, "dataTransfer", {
      value: {
        files: [],
        getData: (type: string) => (type === "text/plain" || type === "text" ? "Dragged idea" : ""),
        types: ["text/plain"],
      },
    });

    fireEvent(box, dropEvent);

    await waitFor(() => expect(captureTextOrLinkIntoBox).toHaveBeenCalledWith("Dragged idea", 2));
  });

  it.skip("captures a dragged browser image URL into a target box as an image", async () => {
    class MockFileReader {
      result: string | ArrayBuffer | null = null;
      onload: null | (() => void) = null;

      readAsDataURL() {
        this.result = "data:image/png;base64,ZmFrZQ==";
        this.onload?.();
      }
    }

    vi.stubGlobal("FileReader", MockFileReader);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob(["fake"], { type: "image/png" })),
      })
    );

    const baseSnapshot: WorkbenchSnapshot = {
      boxes: [
        { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
        { id: 2, name: "Brand", color: "#2563eb", description: "", sortOrder: 1 },
      ],
      items: [],
      panelState: { selectedBoxId: 1 },
    };
    const captureImageDataIntoBox = vi.fn().mockResolvedValue({
      ...baseSnapshot,
      items: [
        {
          id: 320,
          boxId: 2,
          kind: "image",
          title: "hero.png",
          content: "data:image/png;base64,ZmFrZQ==",
          sourceUrl: "",
          sourcePath: "",
          bundleCount: 0,
          sortOrder: 0,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        },
      ],
    });
    const captureTextOrLinkIntoBox = vi.fn();

    window.brainDesktop = {
      ...window.brainDesktop,
      bootstrap: vi.fn().mockResolvedValue(baseSnapshot),
      captureImageDataIntoBox,
      captureTextOrLinkIntoBox,
    };

    render(<App />);

    const box = await screen.findByRole("button", { name: "选择盒子 Brand" });
    const dropEvent = new Event("drop", { bubbles: true, cancelable: true }) as Event & {
      dataTransfer?: {
        files: unknown[];
        getData(type: string): string;
        types: string[];
      };
    };
    Object.defineProperty(dropEvent, "dataTransfer", {
      value: {
        files: [],
        getData: (type: string) =>
          type === "text/uri-list" || type === "text/plain" || type === "text"
            ? "https://example.com/assets/hero.png"
            : "",
        types: ["text/uri-list", "text/plain"],
      },
    });

    fireEvent(box, dropEvent);

    await waitFor(() =>
      expect(captureImageDataIntoBox).toHaveBeenCalledWith("https://example.com/assets/hero.png", "hero.png", 2)
    );
    expect(captureTextOrLinkIntoBox).not.toHaveBeenCalled();
  });

  it("captures pasted images into the current workspace", async () => {
    class MockFileReader {
      result: string | ArrayBuffer | null = null;
      onload: null | (() => void) = null;

      readAsDataURL() {
        this.result = "data:image/png;base64,ZmFrZQ==";
        this.onload?.();
      }
    }

    vi.stubGlobal("FileReader", MockFileReader);

    const captureImageDataIntoBox = vi.fn().mockResolvedValue({
      ...initialSnapshot,
      items: [
        {
          id: 33,
          boxId: 1,
          kind: "image",
          title: "截图",
          content: "data:image/png;base64,ZmFrZQ==",
          sourceUrl: "",
          sourcePath: "",
          bundleCount: 0,
          sortOrder: 0,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        },
      ],
    });

    window.brainDesktop = {
      ...window.brainDesktop,
      captureImageDataIntoBox,
    };

    render(<App />);
    await screen.findByLabelText("工作区拖放区");

    const imageFile = new File(["fake"], "shot.png", { type: "image/png" });
    const event = new Event("paste", { bubbles: true, cancelable: true }) as Event & {
      clipboardData?: {
        getData(type: string): string;
        items: Array<{ kind: string; type: string; getAsFile(): File }>;
        files: File[];
      };
    };
    Object.defineProperty(event, "clipboardData", {
      value: {
        getData: () => "",
        items: [
          {
            kind: "file",
            type: "image/png",
            getAsFile: () => imageFile,
          },
        ],
        files: [imageFile],
      },
    });

    fireEvent(window, event);

    await waitFor(() =>
      expect(captureImageDataIntoBox).toHaveBeenCalledWith("data:image/png;base64,ZmFrZQ==", "shot.png", 1)
    );
  });

  it("shows a restart hint when image paste hits a missing IPC handler", async () => {
    class MockFileReader {
      result: string | ArrayBuffer | null = null;
      onload: null | (() => void) = null;

      readAsDataURL() {
        this.result = "data:image/png;base64,ZmFrZQ==";
        this.onload?.();
      }
    }

    vi.stubGlobal("FileReader", MockFileReader);

    const captureImageDataIntoBox = vi
      .fn()
      .mockRejectedValue(
        new Error(
          "Error invoking remote method 'workbench/capture-image-data-into-box': Error: No handler registered for 'workbench/capture-image-data-into-box'"
        )
      );

    window.brainDesktop = {
      ...window.brainDesktop,
      captureImageDataIntoBox,
    };

    render(<App />);
    await screen.findByLabelText("工作区拖放区");

    const imageFile = new File(["fake"], "shot.png", { type: "image/png" });
    const event = new Event("paste", { bubbles: true, cancelable: true }) as Event & {
      clipboardData?: {
        getData(type: string): string;
        items: Array<{ kind: string; type: string; getAsFile(): File }>;
        files: File[];
      };
    };
    Object.defineProperty(event, "clipboardData", {
      value: {
        getData: () => "",
        items: [
          {
            kind: "file",
            type: "image/png",
            getAsFile: () => imageFile,
          },
        ],
        files: [imageFile],
      },
    });

    fireEvent(window, event);

    expect(
      await screen.findByText("图片粘贴需要完整重启一次开发进程后才能使用")
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/No handler registered for 'workbench\/capture-image-data'/)
    ).not.toBeInTheDocument();
  });

  it("deletes a card from the trash after the undo window", async () => {
    const baseSnapshot: WorkbenchSnapshot = {
      boxes: [{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }],
      items: [
        {
          id: 36,
          boxId: 1,
          kind: "text",
          title: "Delete me",
          content: "Delete me",
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
    const deleteItem = vi.fn().mockResolvedValue({
      ...baseSnapshot,
      items: [],
    });

    window.brainDesktop = {
      ...window.brainDesktop,
      bootstrap: vi.fn().mockResolvedValue(baseSnapshot),
      deleteItem,
    };

    render(<App />);
    const trash = await screen.findByTestId("rail-trash");
    await screen.findByText("Delete me");
    await act(async () => {
      await Promise.resolve();
    });
    vi.useFakeTimers();

    const dragData = createDataTransfer();
    dragData.setData("application/x-brain-item-id", "36");
    await act(async () => {
      fireEvent(trash, createDragEvent("drop", dragData));
      await Promise.resolve();
    });

    expect(screen.getByLabelText("工作台通知")).toHaveTextContent("Delete me");
    await vi.runAllTimersAsync();
    expect(deleteItem).toHaveBeenCalledWith(36);
  });

  it.skip("renames a non-text card inline from the current canvas", async () => {
    const baseSnapshot: WorkbenchSnapshot = {
      boxes: [{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }],
      items: [
        {
          id: 38,
          boxId: 1,
          kind: "link",
          title: "Original title",
          content: "https://example.com/original",
          sourceUrl: "https://example.com/original",
          sourcePath: "",
          bundleCount: 0,
          sortOrder: 0,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        },
      ],
      panelState: { selectedBoxId: 1 },
    };
    const updateItemTitle = vi.fn().mockResolvedValue({
      ...baseSnapshot,
      items: [{ ...baseSnapshot.items[0], title: "Renamed title" }],
    });

    window.brainDesktop = {
      ...window.brainDesktop,
      bootstrap: vi.fn().mockResolvedValue(baseSnapshot),
      updateItemTitle,
    };

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "操作 Original title" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "重命名" }));
    fireEvent.change(screen.getByLabelText("编辑 Original title 的标题"), {
      target: { value: "Renamed title" },
    });
    const renameForm = screen.getByLabelText("编辑 Original title 的标题").closest("form");
    expect(renameForm).not.toBeNull();
    if (renameForm) {
      fireEvent.submit(renameForm);
    }

    await waitFor(() => expect(updateItemTitle).toHaveBeenCalledWith(38, "Renamed title"));
    expect((await screen.findAllByText("Renamed title")).length).toBeGreaterThan(0);
  });

  it.skip("does not render the extra open-link button for link cards", async () => {
    const baseSnapshot: WorkbenchSnapshot = {
      boxes: [{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }],
      items: [
        {
          id: 39,
          boxId: 1,
          kind: "link",
          title: "Hermes Agent",
          content: "https://github.com/NousResearch/hermes-agent",
          sourceUrl: "https://github.com/NousResearch/hermes-agent",
          sourcePath: "",
          bundleCount: 0,
          sortOrder: 0,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        },
      ],
      panelState: { selectedBoxId: 1 },
    };

    window.brainDesktop = {
      ...window.brainDesktop,
      bootstrap: vi.fn().mockResolvedValue(baseSnapshot),
    };

    render(<App />);

    expect(
      await screen.findByRole("link", {
        name: "打开 https://github.com/NousResearch/hermes-agent",
      })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "在浏览器打开 https://github.com/NousResearch/hermes-agent",
      })
    ).not.toBeInTheDocument();
  });

  it.skip("expands a bundle card, shows missing entries, and removes one path", async () => {
    const bundleSnapshot: WorkbenchSnapshot = {
      boxes: [{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }],
      items: [
        {
          id: 53,
          boxId: 1,
          kind: "bundle",
          title: "Dropped bundle",
          content: "2 items",
          sourceUrl: "",
          sourcePath: "",
          bundleCount: 2,
          sortOrder: 0,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        },
      ],
      panelState: { selectedBoxId: 1 },
    };
    const getBundleEntries = vi.fn().mockResolvedValue([
      { entryPath: "C:\\assets\\hero.png", entryKind: "file", sortOrder: 0, exists: true },
      { entryPath: "C:\\assets\\missing", entryKind: "folder", sortOrder: 1, exists: false },
    ]);
    const removeBundleEntry = vi.fn().mockResolvedValue({
      ...bundleSnapshot,
      items: [{ ...bundleSnapshot.items[0], bundleCount: 1 }],
    });

    window.brainDesktop = {
      ...window.brainDesktop,
      bootstrap: vi.fn().mockResolvedValue(bundleSnapshot),
      getBundleEntries,
      removeBundleEntry,
    };

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "展开 Dropped bundle 的内容" }));

    await waitFor(() => expect(getBundleEntries).toHaveBeenCalledWith(53));
    expect(await screen.findByText("路径缺失")).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "移除 C:\\assets\\missing" }));

    await waitFor(() => expect(removeBundleEntry).toHaveBeenCalledWith(53, "C:\\assets\\missing"));
    expect(await screen.findByText("宸茬Щ闄?C:\\assets\\missing")).toBeInTheDocument();
  });

  it.skip("reorders cards by dragging onto a drop position", async () => {
    const baseSnapshot: WorkbenchSnapshot = {
      boxes: [{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }],
      items: [
        {
          id: 71,
          boxId: 1,
          kind: "text",
          title: "Top note",
          content: "Top note",
          sourceUrl: "",
          sourcePath: "",
          bundleCount: 0,
          sortOrder: 0,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        },
        {
          id: 72,
          boxId: 1,
          kind: "text",
          title: "Bottom note",
          content: "Bottom note",
          sourceUrl: "",
          sourcePath: "",
          bundleCount: 0,
          sortOrder: 1,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        },
      ],
      panelState: { selectedBoxId: 1 },
    };
    const moveItemToIndex = vi.fn().mockResolvedValue({
      ...baseSnapshot,
      items: [baseSnapshot.items[1], baseSnapshot.items[0]],
    });

    window.brainDesktop = {
      ...window.brainDesktop,
      bootstrap: vi.fn().mockResolvedValue(baseSnapshot),
      moveItemToIndex,
    };

    render(<App />);

    const dragData = createDataTransfer();
    fireEvent(await screen.findByLabelText("卡片 Top note"), createDragEvent("dragstart", dragData));
    fireEvent(await screen.findByLabelText("放到位置 3"), createDragEvent("drop", dragData));

    await waitFor(() => expect(moveItemToIndex).toHaveBeenCalledWith(71, 1));
  });
});

describe("App current workspace flows", () => {
  it("switches the active box from the workspace home cards", async () => {
    const selectedSnapshot: WorkbenchSnapshot = {
      boxes: [
        { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
        { id: 2, name: "Brand", color: "#2563eb", description: "", sortOrder: 1 },
      ],
      items: [
        {
          id: 21,
          boxId: 2,
          kind: "text",
          title: "Brand note",
          content: "Brand note",
          sourceUrl: "",
          sourcePath: "",
          bundleCount: 0,
          sortOrder: 0,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        },
      ],
      panelState: { selectedBoxId: 2 },
    };
    const selectBox = vi.fn().mockResolvedValue(selectedSnapshot);

    window.brainDesktop = {
      ...window.brainDesktop,
      bootstrap: vi.fn().mockResolvedValue({
        boxes: selectedSnapshot.boxes,
        items: [],
        panelState: { selectedBoxId: 1 },
      }),
      selectBox,
    };

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "打开盒子 Brand" }));

    await waitFor(() => expect(selectBox).toHaveBeenCalledWith(2));
    expect((await screen.findAllByText("Brand note")).length).toBeGreaterThan(0);
  });

  it("creates boxes from the workspace home panel", async () => {
    const baseSnapshot: WorkbenchSnapshot = {
      boxes: [
        { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
        { id: 2, name: "Brand", color: "#2563eb", description: "", sortOrder: 1 },
      ],
      items: [],
      panelState: { selectedBoxId: 1 },
    };
    const createBox = vi.fn().mockResolvedValue({
      ...baseSnapshot,
      boxes: [...baseSnapshot.boxes, { id: 3, name: "Visuals", color: "#16a34a", description: "", sortOrder: 2 }],
      panelState: { selectedBoxId: 3 },
    });

    window.brainDesktop = {
      ...window.brainDesktop,
      bootstrap: vi.fn().mockResolvedValue(baseSnapshot),
      createBox,
    };

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "展开新建盒子" }));
    fireEvent.change(await screen.findByLabelText("新盒子名称"), {
      target: { value: "Visuals" },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加" }));

    await waitFor(() => expect(createBox).toHaveBeenCalledWith("Visuals"));
    expect(await screen.findByRole("button", { name: "打开盒子 Visuals" })).toBeInTheDocument();
  });

  it("captures dropped files into a target box from the workspace home", async () => {
    const baseSnapshot: WorkbenchSnapshot = {
      boxes: [
        { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
        { id: 2, name: "Brand", color: "#2563eb", description: "", sortOrder: 1 },
      ],
      items: [],
      panelState: { selectedBoxId: 1 },
    };
    const captureDroppedPathsIntoBox = vi.fn().mockResolvedValue({
      ...baseSnapshot,
      items: [
        {
          id: 31,
          boxId: 2,
          kind: "file",
          title: "hero.png",
          content: "C:\\assets\\hero.png",
          sourceUrl: "",
          sourcePath: "C:\\assets\\hero.png",
          bundleCount: 0,
          sortOrder: 0,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        },
      ],
    });

    window.brainDesktop = {
      ...window.brainDesktop,
      bootstrap: vi.fn().mockResolvedValue(baseSnapshot),
      captureDroppedPathsIntoBox,
    };

    render(<App />);

    fireEvent(
      await screen.findByRole("button", { name: "打开盒子 Brand" }),
      createFileDropEvent("drop", ["C:\\assets\\hero.png"])
    );

    await waitFor(() =>
      expect(captureDroppedPathsIntoBox).toHaveBeenCalledWith(["C:\\assets\\hero.png"], 2)
    );
  });

  it("captures dragged text directly into a target box from the workspace home", async () => {
    const baseSnapshot: WorkbenchSnapshot = {
      boxes: [
        { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
        { id: 2, name: "Brand", color: "#2563eb", description: "", sortOrder: 1 },
      ],
      items: [],
      panelState: { selectedBoxId: 1 },
    };
    const captureTextOrLinkIntoBox = vi.fn().mockResolvedValue({
      ...baseSnapshot,
      items: [
        {
          id: 32,
          boxId: 2,
          kind: "text",
          title: "Dragged idea",
          content: "Dragged idea",
          sourceUrl: "",
          sourcePath: "",
          bundleCount: 0,
          sortOrder: 0,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        },
      ],
    });

    window.brainDesktop = {
      ...window.brainDesktop,
      bootstrap: vi.fn().mockResolvedValue(baseSnapshot),
      captureTextOrLinkIntoBox,
    };

    render(<App />);

    const box = await screen.findByRole("button", { name: "打开盒子 Brand" });
    const dropEvent = new Event("drop", { bubbles: true, cancelable: true }) as Event & {
      dataTransfer?: {
        files: unknown[];
        getData(type: string): string;
        types: string[];
      };
    };
    Object.defineProperty(dropEvent, "dataTransfer", {
      value: {
        files: [],
        getData: (type: string) => (type === "text/plain" || type === "text" ? "Dragged idea" : ""),
        types: ["text/plain"],
      },
    });

    fireEvent(box, dropEvent);

    await waitFor(() => expect(captureTextOrLinkIntoBox).toHaveBeenCalledWith("Dragged idea", 2));
  });

  it("captures a dragged browser image URL into a target box from the workspace home", async () => {
    class MockFileReader {
      result: string | ArrayBuffer | null = null;
      onload: null | (() => void) = null;

      readAsDataURL() {
        this.result = "data:image/png;base64,ZmFrZQ==";
        this.onload?.();
      }
    }

    vi.stubGlobal("FileReader", MockFileReader);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob(["fake"], { type: "image/png" })),
      })
    );

    const baseSnapshot: WorkbenchSnapshot = {
      boxes: [
        { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
        { id: 2, name: "Brand", color: "#2563eb", description: "", sortOrder: 1 },
      ],
      items: [],
      panelState: { selectedBoxId: 1 },
    };
    const captureImageDataIntoBox = vi.fn().mockResolvedValue({
      ...baseSnapshot,
      items: [
        {
          id: 320,
          boxId: 2,
          kind: "image",
          title: "hero.png",
          content: "data:image/png;base64,ZmFrZQ==",
          sourceUrl: "",
          sourcePath: "",
          bundleCount: 0,
          sortOrder: 0,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        },
      ],
    });
    const captureTextOrLinkIntoBox = vi.fn();

    window.brainDesktop = {
      ...window.brainDesktop,
      bootstrap: vi.fn().mockResolvedValue(baseSnapshot),
      captureImageDataIntoBox,
      captureTextOrLinkIntoBox,
    };

    render(<App />);

    const box = await screen.findByRole("button", { name: "打开盒子 Brand" });
    const dropEvent = new Event("drop", { bubbles: true, cancelable: true }) as Event & {
      dataTransfer?: {
        files: unknown[];
        getData(type: string): string;
        types: string[];
      };
    };
    Object.defineProperty(dropEvent, "dataTransfer", {
      value: {
        files: [],
        getData: (type: string) =>
          type === "text/uri-list" || type === "text/plain" || type === "text"
            ? "https://example.com/assets/hero.png"
            : "",
        types: ["text/uri-list", "text/plain"],
      },
    });

    fireEvent(box, dropEvent);

    await waitFor(() =>
      expect(captureImageDataIntoBox).toHaveBeenCalledWith("https://example.com/assets/hero.png", "hero.png", 2)
    );
    expect(captureTextOrLinkIntoBox).not.toHaveBeenCalled();
  });

  it("renames a non-text card inline after opening the current box", async () => {
    const baseSnapshot: WorkbenchSnapshot = {
      boxes: [{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }],
      items: [
        {
          id: 38,
          boxId: 1,
          kind: "link",
          title: "Original title",
          content: "https://example.com/original",
          sourceUrl: "https://example.com/original",
          sourcePath: "",
          bundleCount: 0,
          sortOrder: 0,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        },
      ],
      panelState: { selectedBoxId: 1 },
    };
    const selectBox = vi.fn().mockResolvedValue(baseSnapshot);
    const updateItemTitle = vi.fn().mockResolvedValue({
      ...baseSnapshot,
      items: [{ ...baseSnapshot.items[0], title: "Renamed title" }],
    });

    window.brainDesktop = {
      ...window.brainDesktop,
      bootstrap: vi.fn().mockResolvedValue(baseSnapshot),
      selectBox,
      updateItemTitle,
    };

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "打开盒子 Inbox" }));
    fireEvent.click(await screen.findByRole("button", { name: "操作 Original title" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "重命名" }));
    fireEvent.change(screen.getByLabelText("编辑 Original title 的标题"), {
      target: { value: "Renamed title" },
    });
    const renameForm = screen.getByLabelText("编辑 Original title 的标题").closest("form");
    expect(renameForm).not.toBeNull();
    if (renameForm) {
      fireEvent.submit(renameForm);
    }

    await waitFor(() => expect(updateItemTitle).toHaveBeenCalledWith(38, "Renamed title"));
    expect((await screen.findAllByText("Renamed title")).length).toBeGreaterThan(0);
  });

  it("does not render the extra open-link button in the current box view", async () => {
    const baseSnapshot: WorkbenchSnapshot = {
      boxes: [{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }],
      items: [
        {
          id: 39,
          boxId: 1,
          kind: "link",
          title: "Hermes Agent",
          content: "https://github.com/NousResearch/hermes-agent",
          sourceUrl: "https://github.com/NousResearch/hermes-agent",
          sourcePath: "",
          bundleCount: 0,
          sortOrder: 0,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        },
      ],
      panelState: { selectedBoxId: 1 },
    };
    const selectBox = vi.fn().mockResolvedValue(baseSnapshot);

    window.brainDesktop = {
      ...window.brainDesktop,
      bootstrap: vi.fn().mockResolvedValue(baseSnapshot),
      selectBox,
    };

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "打开盒子 Inbox" }));

    expect(
      await screen.findByRole("link", {
        name: "打开 https://github.com/NousResearch/hermes-agent",
      })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "在浏览器打开 https://github.com/NousResearch/hermes-agent",
      })
    ).not.toBeInTheDocument();
  });

  it("extracts bundle content after opening the current box", async () => {
    const bundleSnapshot: WorkbenchSnapshot = {
      boxes: [{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }],
      items: [
        {
          id: 53,
          boxId: 1,
          kind: "bundle",
          title: "Dropped bundle",
          content: "2 items",
          sourceUrl: "",
          sourcePath: "",
          bundleCount: 2,
          sortOrder: 0,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        },
      ],
      panelState: { selectedBoxId: 1 },
    };
    const selectBox = vi.fn().mockResolvedValue(bundleSnapshot);
    const getBundleEntries = vi.fn().mockResolvedValue([
      { entryPath: "C:\\assets\\hero.png", entryKind: "file", sortOrder: 0, exists: true },
      { entryPath: "C:\\assets\\missing", entryKind: "folder", sortOrder: 1, exists: false },
    ]);
    const removeBundleEntry = vi.fn().mockResolvedValue({
      ...bundleSnapshot,
      items: [{ ...bundleSnapshot.items[0], bundleCount: 1 }],
    });

    window.brainDesktop = {
      ...window.brainDesktop,
      bootstrap: vi.fn().mockResolvedValue(bundleSnapshot),
      selectBox,
      getBundleEntries,
      removeBundleEntry,
    };

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "打开盒子 Inbox" }));
    fireEvent.click(await screen.findByRole("button", { name: "操作 Dropped bundle" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "内容提取" }));

    await waitFor(() => expect(getBundleEntries).toHaveBeenCalledWith(53));
    expect(await screen.findByRole("dialog", { name: "内容提取 Dropped bundle" })).toBeInTheDocument();
    expect(screen.getByText("路径缺失")).toBeInTheDocument();
    expect(screen.getByDisplayValue(/路径： C:\\assets\\missing/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "移除 C:\\assets\\missing" })).not.toBeInTheDocument();
    expect(removeBundleEntry).not.toHaveBeenCalled();
  });

  it("exports extracted bundle content through the desktop AI export bridge", async () => {
    const bundleSnapshot: WorkbenchSnapshot = {
      boxes: [{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }],
      items: [
        {
          id: 56,
          boxId: 1,
          kind: "bundle",
          title: "Dropped bundle",
          content: "2 items",
          sourceUrl: "",
          sourcePath: "",
          bundleCount: 2,
          sortOrder: 0,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        },
        {
          id: 57,
          boxId: 1,
          kind: "text",
          title: "Source note",
          content: "第一段文本",
          sourceUrl: "",
          sourcePath: "",
          bundleCount: 0,
          sortOrder: 1,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
          bundleParentId: 56,
        },
        {
          id: 58,
          boxId: 1,
          kind: "image",
          title: "preview.png",
          content: "data:image/png;base64,ZmFrZQ==",
          sourceUrl: "",
          sourcePath: "",
          bundleCount: 0,
          sortOrder: 2,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
          bundleParentId: 56,
        },
      ],
      panelState: { selectedBoxId: 1 },
    };
    const selectBox = vi.fn().mockResolvedValue(bundleSnapshot);
    const exportBundleAi = vi.fn().mockResolvedValue("C:\\exports\\Dropped bundle.html");

    window.brainDesktop = {
      ...window.brainDesktop,
      bootstrap: vi.fn().mockResolvedValue(bundleSnapshot),
      selectBox,
      exportBundleAi,
    };

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "打开盒子 Inbox" }));
    fireEvent.click(await screen.findByRole("button", { name: "操作 Dropped bundle" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "内容提取" }));
    const exportButton = await screen.findByRole("button", { name: "导出给AI" });
    await waitFor(() => expect(exportButton).not.toBeDisabled());
    fireEvent.click(exportButton);

    await waitFor(() => expect(exportBundleAi).toHaveBeenCalledTimes(1));
    expect(exportBundleAi).toHaveBeenCalledWith("Dropped bundle", expect.stringContaining("<html"));
  });

  it("reorders cards after opening the current box", async () => {
    const baseSnapshot: WorkbenchSnapshot = {
      boxes: [{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }],
      items: [
        {
          id: 71,
          boxId: 1,
          kind: "text",
          title: "Top note",
          content: "Top note",
          sourceUrl: "",
          sourcePath: "",
          bundleCount: 0,
          sortOrder: 0,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        },
        {
          id: 72,
          boxId: 1,
          kind: "text",
          title: "Bottom note",
          content: "Bottom note",
          sourceUrl: "",
          sourcePath: "",
          bundleCount: 0,
          sortOrder: 1,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        },
      ],
      panelState: { selectedBoxId: 1 },
    };
    const selectBox = vi.fn().mockResolvedValue(baseSnapshot);
    const moveItemToIndex = vi.fn().mockResolvedValue({
      ...baseSnapshot,
      items: [baseSnapshot.items[1], baseSnapshot.items[0]],
    });

    window.brainDesktop = {
      ...window.brainDesktop,
      bootstrap: vi.fn().mockResolvedValue(baseSnapshot),
      selectBox,
      moveItemToIndex,
    };

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "打开盒子 Inbox" }));

    const dragData = createDataTransfer();
    fireEvent(await screen.findByLabelText("卡片 Top note"), createDragEvent("dragstart", dragData));
    fireEvent(await screen.findByLabelText("放到位置 3"), createDragEvent("drop", dragData));

    await waitFor(() => expect(moveItemToIndex).toHaveBeenCalledWith(71, 1));
  });

  it("copies text card content through the desktop clipboard bridge", async () => {
    const baseSnapshot: WorkbenchSnapshot = {
      boxes: [{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }],
      items: [
        {
          id: 73,
          boxId: 1,
          kind: "text",
          title: "Useful note",
          content: "Useful note body",
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
    const selectBox = vi.fn().mockResolvedValue(baseSnapshot);
    const copyText = vi.fn().mockResolvedValue(undefined);

    window.brainDesktop = {
      ...window.brainDesktop,
      bootstrap: vi.fn().mockResolvedValue(baseSnapshot),
      selectBox,
      copyText,
    };

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "打开盒子 Inbox" }));
    fireEvent.click(await screen.findByRole("button", { name: "操作 Useful note" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "复制文本内容" }));

    await waitFor(() => expect(copyText).toHaveBeenCalledWith("Useful note body"));
    expect(await screen.findByText("已复制")).toBeInTheDocument();
  });

  it("copies link card urls through the desktop clipboard bridge", async () => {
    const baseSnapshot: WorkbenchSnapshot = {
      boxes: [{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }],
      items: [
        {
          id: 74,
          boxId: 1,
          kind: "link",
          title: "Hermes Agent",
          content: "https://github.com/NousResearch/hermes-agent",
          sourceUrl: "https://github.com/NousResearch/hermes-agent",
          sourcePath: "",
          bundleCount: 0,
          sortOrder: 0,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        },
      ],
      panelState: { selectedBoxId: 1 },
    };
    const selectBox = vi.fn().mockResolvedValue(baseSnapshot);
    const copyText = vi.fn().mockResolvedValue(undefined);

    window.brainDesktop = {
      ...window.brainDesktop,
      bootstrap: vi.fn().mockResolvedValue(baseSnapshot),
      selectBox,
      copyText,
    };

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "打开盒子 Inbox" }));
    fireEvent.click(await screen.findByRole("button", { name: "操作 Hermes Agent" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "复制链接" }));

    await waitFor(() => expect(copyText).toHaveBeenCalledWith("https://github.com/NousResearch/hermes-agent"));
    expect(await screen.findByText("已复制")).toBeInTheDocument();
  });

  it("copies file card paths through the desktop clipboard bridge", async () => {
    const baseSnapshot: WorkbenchSnapshot = {
      boxes: [{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }],
      items: [
        {
          id: 75,
          boxId: 1,
          kind: "file",
          title: "notes.pdf",
          content: "C:\\docs\\notes.pdf",
          sourceUrl: "",
          sourcePath: "C:\\docs\\notes.pdf",
          bundleCount: 0,
          sortOrder: 0,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        },
      ],
      panelState: { selectedBoxId: 1 },
    };
    const selectBox = vi.fn().mockResolvedValue(baseSnapshot);
    const copyText = vi.fn().mockResolvedValue(undefined);

    window.brainDesktop = {
      ...window.brainDesktop,
      bootstrap: vi.fn().mockResolvedValue(baseSnapshot),
      selectBox,
      copyText,
    };

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "打开盒子 Inbox" }));
    fireEvent.click(await screen.findByRole("button", { name: "操作 notes.pdf" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "复制路径" }));

    await waitFor(() => expect(copyText).toHaveBeenCalledWith("C:\\docs\\notes.pdf"));
    expect(await screen.findByText("已复制")).toBeInTheDocument();
  });

  it("moves an uncategorized recent card to another box from recent additions", async () => {
    const today = new Date().toISOString();
    const baseSnapshot: WorkbenchSnapshot = {
      boxes: [
        { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
        { id: 2, name: "Research", color: "#2563eb", description: "", sortOrder: 1 },
      ],
      items: [
        {
          id: 91,
          boxId: 1,
          kind: "text",
          title: "Today idea",
          content: "Today idea",
          sourceUrl: "",
          sourcePath: "",
          bundleCount: 0,
          sortOrder: 0,
          createdAt: today,
          updatedAt: today,
        },
      ],
      panelState: { selectedBoxId: 1 },
    };
    const movedSnapshot: WorkbenchSnapshot = {
      ...baseSnapshot,
      items: [{ ...baseSnapshot.items[0], boxId: 2 }],
    };
    const moveItemToBox = vi.fn().mockResolvedValue(movedSnapshot);

    window.brainDesktop = {
      ...window.brainDesktop,
      bootstrap: vi.fn().mockResolvedValue(baseSnapshot),
      selectBox: vi.fn().mockResolvedValue(baseSnapshot),
      moveItemToBox,
    };

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "打开最近添加" }));
    fireEvent.change(await screen.findByLabelText("分类 Today idea 到盒子"), { target: { value: "2" } });

    await waitFor(() => expect(moveItemToBox).toHaveBeenCalledWith(91, 2));
    expect(await screen.findByText("已移到 Research")).toBeInTheDocument();
  });

  it("shows one error toast and keeps the rail move target open when drag moving to a box fails", async () => {
    const baseSnapshot: WorkbenchSnapshot = {
      boxes: [
        { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
        { id: 2, name: "Research", color: "#2563eb", description: "", sortOrder: 1 },
      ],
      items: [
        {
          id: 92,
          boxId: 1,
          kind: "text",
          title: "Move failure",
          content: "Move failure",
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
    const moveItemToBox = vi.fn().mockRejectedValue(new Error("移动写入失败"));

    window.brainDesktop = {
      ...window.brainDesktop,
      bootstrap: vi.fn().mockResolvedValue(baseSnapshot),
      selectBox: vi.fn().mockResolvedValue(baseSnapshot),
      moveItemToBox,
    };

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "打开盒子 Inbox" }));
    const dataTransfer = createDataTransfer();
    fireEvent(screen.getByLabelText("卡片 Move failure"), createDragEvent("dragstart", dataTransfer));
    fireEvent(screen.getByLabelText("盒子"), createDragEvent("dragenter", dataTransfer));
    const target = screen.getByRole("button", { name: "移动到盒子 Research" });

    fireEvent(target, createDragEvent("dragover", dataTransfer));
    fireEvent(target, createDragEvent("drop", dataTransfer));

    expect(await screen.findByText("移动写入失败")).toBeInTheDocument();
    expect(await screen.findByText("移动失败，卡片仍在原盒子")).toBeInTheDocument();
    expect(screen.getAllByText("移动写入失败")).toHaveLength(1);
    expect(screen.getByLabelText("卡片 Move failure")).toBeInTheDocument();
  });

  it("groups cards after dropping one card onto another in the current box", async () => {
    const baseSnapshot: WorkbenchSnapshot = {
      boxes: [{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }],
      items: [
        {
          id: 81,
          boxId: 1,
          kind: "text",
          title: "Cover note",
          content: "Cover note",
          sourceUrl: "",
          sourcePath: "",
          bundleCount: 0,
          sortOrder: 0,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        },
        {
          id: 82,
          boxId: 1,
          kind: "text",
          title: "Source note",
          content: "Source note",
          sourceUrl: "",
          sourcePath: "",
          bundleCount: 0,
          sortOrder: 1,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        },
      ],
      panelState: { selectedBoxId: 1 },
    };
    const selectBox = vi.fn().mockResolvedValue(baseSnapshot);
    const groupItems = vi.fn().mockResolvedValue({
      ...baseSnapshot,
      items: [
        {
          id: 83,
          boxId: 1,
          kind: "bundle",
          title: "Cover note",
          content: "Cover note",
          sourceUrl: "",
          sourcePath: "",
          bundleCount: 2,
          sortOrder: 0,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        },
        { ...baseSnapshot.items[0], bundleParentId: 83, sortOrder: 0 },
        { ...baseSnapshot.items[1], bundleParentId: 83, sortOrder: 1 },
      ],
    });

    window.brainDesktop = {
      ...window.brainDesktop,
      bootstrap: vi.fn().mockResolvedValue(baseSnapshot),
      selectBox,
      groupItems,
    };

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "打开盒子 Inbox" }));

    const dragData = createDataTransfer();
    fireEvent(await screen.findByLabelText("卡片 Source note"), createDragEvent("dragstart", dragData));
    fireEvent(await screen.findByLabelText("卡片 Cover note"), createDragEvent("drop", dragData));

    await waitFor(() => expect(groupItems).toHaveBeenCalledWith(82, 81));
  });
});

describe("preload bridge", () => {
  beforeEach(() => {
    electronMocks.exposeInMainWorld.mockClear();
    electronMocks.invoke.mockClear();
    electronMocks.on.mockClear();
    electronMocks.removeListener.mockClear();
    vi.resetModules();
  });

  it("exposes capture and card action methods", async () => {
    await import("./preload");

    expect(electronMocks.exposeInMainWorld).toHaveBeenCalledWith(
      "brainDesktop",
      expect.objectContaining({
        bootstrap: expect.any(Function),
        getNotepadSnapshot: expect.any(Function),
        createNotepadGroup: expect.any(Function),
        createNotepadNote: expect.any(Function),
        getAutoCaptureSnapshot: expect.any(Function),
        startAutoCapture: expect.any(Function),
        stopAutoCapture: expect.any(Function),
        pauseAutoCaptureForPrivacy: expect.any(Function),
        captureDesktopNow: expect.any(Function),
        searchAutoCaptures: expect.any(Function),
        deleteAutoCaptureEntry: expect.any(Function),
        clearAutoCaptures: expect.any(Function),
        getStorageUsage: expect.any(Function),
        cleanupExpiredAutoCaptures: expect.any(Function),
        cleanupOrphanedStorageFiles: expect.any(Function),
        searchLocal: expect.any(Function),
        onAutoCaptureChanged: expect.any(Function),
        onClipboardCapture: expect.any(Function),
        captureClipboardNow: expect.any(Function),
        setClipboardWatcherEnabled: expect.any(Function),
        getClipboardWatcherStatus: expect.any(Function),
        setClipboardCaptureBox: expect.any(Function),
        getClipboardCaptureBox: expect.any(Function),
        getPathsForFiles: expect.any(Function),
        captureTextOrLink: expect.any(Function),
        captureTextOrLinkIntoBox: expect.any(Function),
        captureImageData: expect.any(Function),
        captureImageDataIntoBox: expect.any(Function),
        captureDroppedPaths: expect.any(Function),
        captureDroppedPathsIntoBox: expect.any(Function),
        createBox: expect.any(Function),
        updateBox: expect.any(Function),
        reorderBox: expect.any(Function),
        deleteBox: expect.any(Function),
        clearBoxItems: expect.any(Function),
        deleteItem: expect.any(Function),
        updateItemTitle: expect.any(Function),
        removeBundleEntry: expect.any(Function),
        selectBox: expect.any(Function),
        openPath: expect.any(Function),
        openExternal: expect.any(Function),
        copyText: expect.any(Function),
        groupItems: expect.any(Function),
        enrichLinkTitle: expect.any(Function),
        suggestAiOrganization: expect.any(Function),
        applyAiOrganization: expect.any(Function),
        getAiProviderConfig: expect.any(Function),
        saveAiProviderConfig: expect.any(Function),
        testAiProviderConnection: expect.any(Function),
        moveItemToBox: expect.any(Function),
        moveItemToIndex: expect.any(Function),
        reorderItem: expect.any(Function),
        getBundleEntries: expect.any(Function),
      })
    );
  });

  it("invokes the capture and card action channels", async () => {
    await import("./preload");
    const exposedApi = electronMocks.exposeInMainWorld.mock.calls[0]?.[1] as {
      bootstrap: () => Promise<unknown>;
      getNotepadSnapshot: () => Promise<unknown>;
      createNotepadGroup: (name: string) => Promise<unknown>;
      createNotepadNote: (groupId: number, content: string) => Promise<unknown>;
      getAutoCaptureSnapshot: () => Promise<unknown>;
      startAutoCapture: (intervalMs?: number) => Promise<unknown>;
      stopAutoCapture: () => Promise<unknown>;
      pauseAutoCaptureForPrivacy: () => Promise<unknown>;
      captureDesktopNow: () => Promise<unknown>;
      searchAutoCaptures: (query: string) => Promise<unknown>;
      deleteAutoCaptureEntry: (entryId: number) => Promise<unknown>;
      clearAutoCaptures: () => Promise<unknown>;
      getStorageUsage: () => Promise<unknown>;
      cleanupExpiredAutoCaptures: () => Promise<unknown>;
      cleanupOrphanedStorageFiles: () => Promise<unknown>;
      searchLocal: (query: string, limit?: number) => Promise<unknown>;
      onAutoCaptureChanged: (handler: (snapshot: unknown) => void) => () => void;
      onClipboardCapture: (handler: (result: unknown) => void) => () => void;
      captureClipboardNow: () => Promise<unknown>;
      setClipboardWatcherEnabled: (enabled: boolean) => Promise<unknown>;
      getClipboardWatcherStatus: () => Promise<unknown>;
      setClipboardCaptureBox: (boxId: number) => Promise<unknown>;
      getClipboardCaptureBox: () => Promise<unknown>;
      getPathsForFiles: (files: File[]) => string[];
      captureTextOrLink: (input: string) => Promise<unknown>;
      captureTextOrLinkIntoBox: (input: string, boxId: number) => Promise<unknown>;
      captureImageData: (dataUrl: string, title: string) => Promise<unknown>;
      captureImageDataIntoBox: (dataUrl: string, title: string, boxId: number) => Promise<unknown>;
      captureDroppedPaths: (paths: string[]) => Promise<unknown>;
      captureDroppedPathsIntoBox: (paths: string[], boxId: number) => Promise<unknown>;
      createBox: (name: string) => Promise<unknown>;
      updateBox: (boxId: number, name: string, description: string) => Promise<unknown>;
      reorderBox: (boxId: number, direction: "up" | "down") => Promise<unknown>;
      deleteBox: (boxId: number) => Promise<unknown>;
      clearBoxItems: (boxId: number, kind: "all" | "text" | "link" | "image" | "file" | "bundle") => Promise<unknown>;
      deleteItem: (itemId: number) => Promise<unknown>;
      updateItemTitle: (itemId: number, title: string) => Promise<unknown>;
      removeBundleEntry: (itemId: number, entryPath: string) => Promise<unknown>;
      selectBox: (boxId: number) => Promise<unknown>;
      openPath: (path: string) => Promise<unknown>;
      openExternal: (url: string) => Promise<unknown>;
      copyText: (text: string) => Promise<unknown>;
      groupItems: (sourceItemId: number, targetItemId: number) => Promise<unknown>;
      enrichLinkTitle: (itemId: number, url: string) => Promise<unknown>;
      suggestAiOrganization: (boxId: number) => Promise<unknown>;
      applyAiOrganization: (suggestions: unknown[]) => Promise<unknown>;
      getAiProviderConfig: () => Promise<unknown>;
      saveAiProviderConfig: (input: unknown) => Promise<unknown>;
      testAiProviderConnection: (input: unknown) => Promise<unknown>;
      moveItemToBox: (itemId: number, boxId: number) => Promise<unknown>;
      moveItemToIndex: (itemId: number, targetIndex: number) => Promise<unknown>;
      reorderItem: (itemId: number, direction: "up" | "down") => Promise<unknown>;
      getBundleEntries: (itemId: number) => Promise<unknown>;
    };

    await exposedApi.bootstrap();
    await exposedApi.getNotepadSnapshot();
    await exposedApi.createNotepadGroup("灵感");
    await exposedApi.createNotepadNote(3, "Quick idea");
    const unsubscribe = exposedApi.onClipboardCapture(() => undefined);
    unsubscribe();
    await exposedApi.captureClipboardNow();
    await exposedApi.setClipboardWatcherEnabled(true);
    await exposedApi.getClipboardWatcherStatus();
    await exposedApi.setClipboardCaptureBox(7);
    await exposedApi.getClipboardCaptureBox();
    expect(exposedApi.getPathsForFiles([new File(["fake"], "brief.docx")])).toEqual(["C:\\mock\\brief.docx"]);
    await exposedApi.captureTextOrLink("Quick note");
    await exposedApi.captureTextOrLinkIntoBox("Quick note", 7);
    await exposedApi.captureImageData("data:image/png;base64,ZmFrZQ==", "shot.png");
    await exposedApi.captureImageDataIntoBox("data:image/png;base64,ZmFrZQ==", "shot.png", 7);
    await exposedApi.captureDroppedPaths(["C:\\assets\\hero.png"]);
    await exposedApi.captureDroppedPathsIntoBox(["C:\\assets\\hero.png"], 7);
    await exposedApi.createBox("Visuals");
    await exposedApi.updateBox(7, "Library", "Saved references");
    await exposedApi.reorderBox(7, "up");
    await exposedApi.deleteBox(7);
    await exposedApi.clearBoxItems(7, "link");
    await exposedApi.deleteItem(42);
    await exposedApi.updateItemTitle(42, "Renamed");
    await exposedApi.removeBundleEntry(42, "C:\\assets\\missing");
    await exposedApi.selectBox(7);
    await exposedApi.openPath("C:\\assets\\hero.png");
    await exposedApi.openExternal("https://example.com");
    await exposedApi.copyText("C:\\assets\\hero.png");
    await exposedApi.groupItems(42, 7);
    await exposedApi.enrichLinkTitle(42, "https://example.com");
    await exposedApi.suggestAiOrganization(7);
    await exposedApi.applyAiOrganization([]);
    await exposedApi.getAiProviderConfig();
    await exposedApi.saveAiProviderConfig({
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
    });
    await exposedApi.testAiProviderConnection({
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
    });
    await exposedApi.moveItemToBox(42, 7);
    await exposedApi.moveItemToIndex(42, 3);
    await exposedApi.reorderItem(42, "down");
    await exposedApi.getBundleEntries(42);
    await exposedApi.getAutoCaptureSnapshot();
    await exposedApi.startAutoCapture(60_000);
    await exposedApi.stopAutoCapture();
    await exposedApi.pauseAutoCaptureForPrivacy();
    await exposedApi.captureDesktopNow();
    await exposedApi.searchAutoCaptures("idea");
    await exposedApi.deleteAutoCaptureEntry(9);
    await exposedApi.clearAutoCaptures();
    const unsubscribeAutoCapture = exposedApi.onAutoCaptureChanged(() => undefined);
    unsubscribeAutoCapture();
    await exposedApi.getStorageUsage();
    await exposedApi.cleanupExpiredAutoCaptures();
    await exposedApi.cleanupOrphanedStorageFiles();
    await exposedApi.searchLocal("预算", 8);

    expect(electronMocks.invoke).toHaveBeenNthCalledWith(1, "workbench/bootstrap");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(2, "notepad/get-snapshot");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(3, "notepad/create-group", "灵感");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(4, "notepad/create-note", 3, "Quick idea");
    expect(electronMocks.on).toHaveBeenCalledWith("workbench/clipboard-capture-changed", expect.any(Function));
    expect(electronMocks.removeListener).toHaveBeenCalledWith(
      "workbench/clipboard-capture-changed",
      expect.any(Function)
    );
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(5, "workbench/capture-clipboard-now");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(6, "workbench/set-clipboard-watcher-enabled", true);
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(7, "workbench/get-clipboard-watcher-status");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(8, "workbench/set-clipboard-capture-box", 7);
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(9, "workbench/get-clipboard-capture-box");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(10, "workbench/capture-text-or-link", "Quick note");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(11, "workbench/capture-text-or-link-into-box", "Quick note", 7);
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(
      12,
      "workbench/capture-image-data",
      "data:image/png;base64,ZmFrZQ==",
      "shot.png"
    );
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(
      13,
      "workbench/capture-image-data-into-box",
      "data:image/png;base64,ZmFrZQ==",
      "shot.png",
      7
    );
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(14, "workbench/capture-dropped-paths", ["C:\\assets\\hero.png"]);
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(
      15,
      "workbench/capture-dropped-paths-into-box",
      ["C:\\assets\\hero.png"],
      7
    );
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(16, "workbench/create-box", "Visuals");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(17, "workbench/update-box", 7, "Library", "Saved references");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(18, "workbench/reorder-box", 7, "up");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(19, "workbench/delete-box", 7);
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(20, "workbench/clear-box-items", 7, "link");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(21, "workbench/delete-item", 42);
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(22, "workbench/update-item-title", 42, "Renamed");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(23, "workbench/remove-bundle-entry", 42, "C:\\assets\\missing");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(24, "workbench/select-box", 7);
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(25, "workbench/open-path", "C:\\assets\\hero.png");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(26, "workbench/open-external", "https://example.com");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(27, "workbench/copy-text", "C:\\assets\\hero.png");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(28, "workbench/group-items", 42, 7);
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(29, "workbench/enrich-link-title", 42, "https://example.com");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(30, "workbench/suggest-ai-organization", 7);
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(31, "workbench/apply-ai-organization", []);
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(32, "workbench/get-ai-provider-config");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(33, "workbench/save-ai-provider-config", {
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
    });
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(34, "workbench/test-ai-provider-connection", {
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
    });
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(35, "workbench/move-item-to-box", 42, 7);
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(36, "workbench/move-item-to-index", 42, 3);
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(37, "workbench/reorder-item", 42, "down");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(38, "workbench/get-bundle-entries", 42);
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(39, "auto-capture/get-snapshot", undefined);
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(40, "auto-capture/start", 60_000);
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(41, "auto-capture/stop");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(42, "auto-capture/pause-for-privacy");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(43, "auto-capture/capture-now");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(44, "auto-capture/search", "idea");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(45, "auto-capture/delete-entry", 9);
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(46, "auto-capture/clear");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(47, "storage/get-usage");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(48, "storage/cleanup-expired-auto-captures");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(49, "storage/cleanup-orphaned-files");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(50, "search/local", "预算", 8);
    expect(electronMocks.on).toHaveBeenCalledWith("auto-capture/changed", expect.any(Function));
    expect(electronMocks.removeListener).toHaveBeenCalledWith("auto-capture/changed", expect.any(Function));
    expect(electronMocks.getPathForFile).toHaveBeenCalledWith(expect.objectContaining({ name: "brief.docx" }));
  });
});
