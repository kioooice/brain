import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";

function createDropEvent(type: string, paths: string[]) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as Event & {
    dataTransfer?: {
      files: Array<{ path: string }>;
      items?: Array<{ kind: string; type: string; getAsFile(): File | null }>;
      getData(type: string): string;
    };
  };
  Object.defineProperty(event, "dataTransfer", {
    value: {
      files: paths.map((path) => ({ path })),
      items: [],
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

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("AppShell", () => {
  it("switches to recent additions, settings, and about panels from the rail navigation", () => {
    render(
      <AppShell
        onCaptureText={async () => undefined}
        snapshot={{
          boxes: [{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }],
          items: [],
          panelState: { selectedBoxId: 1 },
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "打开最近添加" }));
    expect(screen.getByRole("heading", { name: "最近添加" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "打开设置" }));
    expect(screen.getByRole("heading", { name: "应用设置" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "打开关于" }));
    expect(screen.getByRole("heading", { name: "Brain Desktop" })).toBeInTheDocument();
    expect(screen.getByText("Ctrl+Shift+B 收集剪贴板；Ctrl+Alt+B 开启或关闭自动监听。")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "AI 接口" })).toBeInTheDocument();
  });

  it("saves DeepSeek API settings from the about panel", () => {
    const onSaveAiProviderConfig = vi.fn().mockResolvedValue(undefined);

    render(
      <AppShell
        onCaptureText={async () => undefined}
        onSaveAiProviderConfig={onSaveAiProviderConfig}
        aiProviderConfig={{
          provider: "deepseek",
          baseUrl: "https://api.deepseek.com",
          model: "deepseek-v4-flash",
          apiKeyConfigured: false,
          apiKeyPreview: "",
        }}
        snapshot={{
          boxes: [{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }],
          items: [],
          panelState: { selectedBoxId: 1 },
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "打开关于" }));
    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "sk-test" } });
    fireEvent.change(screen.getByLabelText("Model"), { target: { value: "deepseek-v4-pro" } });
    fireEvent.click(screen.getByRole("button", { name: "保存 API" }));

    expect(onSaveAiProviderConfig).toHaveBeenCalledWith({
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-pro",
      apiKey: "sk-test",
    });
  });

  it("saves a notepad draft into the chosen group", async () => {
    const onCreateNotepadNote = vi.fn().mockResolvedValue({
      groups: [
        { id: 1, name: "默认", sortOrder: 0, createdAt: "", updatedAt: "" },
        { id: 2, name: "灵感", sortOrder: 1, createdAt: "", updatedAt: "" },
      ],
      notes: [
        {
          id: 7,
          groupId: 2,
          content: "新的想法",
          sortOrder: 0,
          createdAt: "",
          updatedAt: "",
        },
      ],
    });

    render(
      <AppShell
        onCaptureText={async () => undefined}
        onCreateNotepadNote={onCreateNotepadNote}
        notepadSnapshot={{
          groups: [
            { id: 1, name: "默认", sortOrder: 0, createdAt: "", updatedAt: "" },
            { id: 2, name: "灵感", sortOrder: 1, createdAt: "", updatedAt: "" },
          ],
          notes: [],
        }}
        snapshot={{
          boxes: [
            { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
            { id: 2, name: "Ideas", color: "#2563eb", description: "", sortOrder: 1 },
          ],
          items: [],
          panelState: { selectedBoxId: 1 },
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "打开记事本" }));
    expect(screen.getByRole("heading", { name: "记事本" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("记事本内容"), { target: { value: "新的想法" } });
    fireEvent.click(screen.getByRole("button", { name: "打开记事本分组 灵感" }));
    fireEvent.click(screen.getByRole("button", { name: "保存想法" }));

    await waitFor(() => expect(onCreateNotepadNote).toHaveBeenCalledWith(2, "新的想法"));
    await waitFor(() => expect(screen.getByLabelText("记事本内容")).toHaveValue(""));
    expect(window.localStorage.getItem("brain:notepad:draft")).toBeNull();
  });

  it("filters automatic captures by OCR text as the search input changes", async () => {
    const onSearchAutoCaptures = vi.fn().mockResolvedValue(undefined);

    const { container } = render(
      <AppShell
        onCaptureText={async () => undefined}
        onSearchAutoCaptures={onSearchAutoCaptures}
        autoCaptureSnapshot={{
          entries: [
            {
              id: 1,
              imagePath: "C:\\brain\\captures\\budget.png",
              imageUrl: "data:image/png;base64,YnVkZ2V0LWZ1bGw=",
              thumbnailUrl: "data:image/jpeg;base64,YnVkZ2V0LXRodW1i",
              ocrText: "发票 金额 预 算",
              createdAt: "2026-05-04T03:10:00.000Z",
            },
            {
              id: 2,
              imagePath: "C:\\brain\\captures\\meeting.png",
              imageUrl: "data:image/png;base64,ZmFrZQ==",
              thumbnailUrl: "data:image/jpeg;base64,bWVldGluZy10aHVtYg==",
              ocrText: "会议 白板",
              createdAt: "2026-05-04T03:09:00.000Z",
            },
          ],
          running: true,
          intervalMs: 60_000,
          lastError: "",
          ocrAvailable: true,
          ocrStatus: "OCR 可用",
          paused: false,
          pauseReason: null,
        }}
        snapshot={{
          boxes: [{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }],
          items: [],
          panelState: { selectedBoxId: 1 },
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "打开自动记录" }));
    expect(screen.getByText("发票 金额 预 算")).toBeInTheDocument();
    expect(screen.getByText("会议 白板")).toBeInTheDocument();
    expect(container.querySelector(".auto-capture-thumb img")).toHaveAttribute(
      "src",
      "data:image/jpeg;base64,YnVkZ2V0LXRodW1i"
    );

    fireEvent.click(screen.getByRole("button", { name: "查看自动记录 05/04 11:10" }));
    expect(container.querySelector(".auto-capture-preview-stage img")).toHaveAttribute(
      "src",
      "data:image/png;base64,YnVkZ2V0LWZ1bGw="
    );
    fireEvent.click(screen.getByRole("button", { name: "关闭自动记录预览" }));

    fireEvent.change(screen.getByLabelText("搜索自动记录"), { target: { value: "预算" } });

    await waitFor(() => expect(screen.queryByText("会议 白板")).not.toBeInTheDocument());
    expect(screen.getByText("发票 金额 预 算")).toBeInTheDocument();
    expect(onSearchAutoCaptures).toHaveBeenCalledWith("预算");
  });

  it("shows a privacy pause entry and blocks manual capture while paused", () => {
    const onPauseAutoCaptureForPrivacy = vi.fn().mockResolvedValue(undefined);
    const onCaptureDesktopNow = vi.fn().mockResolvedValue(undefined);

    render(
      <AppShell
        onCaptureText={async () => undefined}
        onPauseAutoCaptureForPrivacy={onPauseAutoCaptureForPrivacy}
        onCaptureDesktopNow={onCaptureDesktopNow}
        autoCaptureSnapshot={{
          entries: [],
          running: false,
          intervalMs: 60_000,
          lastError: "",
          ocrAvailable: false,
          ocrStatus: "等待首次识别",
          paused: true,
          pauseReason: "privacy",
        }}
        snapshot={{
          boxes: [{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }],
          items: [],
          panelState: { selectedBoxId: 1 },
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "打开自动记录" }));

    expect(screen.getByText("隐私暂停中")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "立即截取" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "隐私暂停" }));

    expect(onPauseAutoCaptureForPrivacy).toHaveBeenCalledTimes(1);
    expect(onCaptureDesktopNow).not.toHaveBeenCalled();
  });

  it("clears and tests DeepSeek API settings from the about panel", () => {
    const onSaveAiProviderConfig = vi.fn().mockResolvedValue(undefined);
    const onTestAiProviderConnection = vi.fn().mockResolvedValue(undefined);

    render(
      <AppShell
        onCaptureText={async () => undefined}
        onSaveAiProviderConfig={onSaveAiProviderConfig}
        onTestAiProviderConnection={onTestAiProviderConnection}
        aiProviderConfig={{
          provider: "deepseek",
          baseUrl: "https://api.deepseek.com",
          model: "deepseek-v4-flash",
          apiKeyConfigured: true,
          apiKeyPreview: "sk-...cdef",
        }}
        snapshot={{
          boxes: [{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }],
          items: [],
          panelState: { selectedBoxId: 1 },
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "打开关于" }));
    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "sk-new" } });
    fireEvent.click(screen.getByRole("button", { name: "测试连接" }));
    fireEvent.click(screen.getByRole("button", { name: "清除 Key" }));

    expect(onTestAiProviderConnection).toHaveBeenCalledWith({
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
      apiKey: "sk-new",
    });
    expect(onSaveAiProviderConfig).toHaveBeenCalledWith({
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
      clearApiKey: true,
    });
  });

  it("shows storage usage and exposes cleanup actions from settings", () => {
    const onRefreshStorageUsage = vi.fn().mockResolvedValue(undefined);
    const onCleanupExpiredAutoCaptures = vi.fn().mockResolvedValue(undefined);
    const onCleanupOrphanedStorageFiles = vi.fn().mockResolvedValue(undefined);

    render(
      <AppShell
        onCaptureText={async () => undefined}
        storageUsage={{
          databaseBytes: 1024 * 1024,
          imageBytes: 2 * 1024 * 1024,
          thumbnailBytes: 512 * 1024,
          autoCaptureBytes: 4 * 1024 * 1024,
          totalBytes: 7.5 * 1024 * 1024,
        }}
        onRefreshStorageUsage={onRefreshStorageUsage}
        onCleanupExpiredAutoCaptures={onCleanupExpiredAutoCaptures}
        onCleanupOrphanedStorageFiles={onCleanupOrphanedStorageFiles}
        snapshot={{
          boxes: [{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }],
          items: [],
          panelState: { selectedBoxId: 1 },
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "打开设置" }));

    expect(screen.getByRole("heading", { name: "本地占用" })).toBeInTheDocument();
    expect(screen.getByLabelText("本地占用明细")).toHaveTextContent("数据库1 MB");
    expect(screen.getByLabelText("本地占用明细")).toHaveTextContent("自动截屏4 MB");
    expect(screen.getByLabelText("本地占用合计")).toHaveTextContent("7.5 MB");

    fireEvent.click(screen.getByRole("button", { name: "刷新占用" }));
    fireEvent.click(screen.getByRole("button", { name: "清理过期自动记录" }));
    fireEvent.click(screen.getByRole("button", { name: "清理无引用图片" }));

    expect(onRefreshStorageUsage).toHaveBeenCalledTimes(1);
    expect(onCleanupExpiredAutoCaptures).toHaveBeenCalledTimes(1);
    expect(onCleanupOrphanedStorageFiles).toHaveBeenCalledTimes(1);
  });

  it("shows a watcher toggle that sends new captures to recent additions", () => {
    const onToggleClipboardWatcher = vi.fn().mockResolvedValue(undefined);

    render(
      <AppShell
        onCaptureText={async () => undefined}
        clipboardWatcherRunning={false}
        onToggleClipboardWatcher={onToggleClipboardWatcher}
        snapshot={{
          boxes: [
            { id: 1, name: "默认", color: "#f97316", description: "", sortOrder: 0 },
            { id: 2, name: "AI", color: "#2563eb", description: "", sortOrder: 1 },
          ],
          items: [],
          panelState: { selectedBoxId: 2 },
        }}
      />
    );

    expect(screen.getByRole("button", { name: "自动监听：关" })).toBeInTheDocument();
    expect(screen.queryByText("Ctrl+Shift+B 收集剪贴板")).not.toBeInTheDocument();
    expect(screen.getByLabelText("自动监听详情")).toHaveTextContent("进入 最近添加");

    fireEvent.click(screen.getByRole("button", { name: "自动监听：关" }));

    expect(onToggleClipboardWatcher).toHaveBeenCalledTimes(1);
  });

  it("shows clipboard watcher details and the latest capture status", () => {
    render(
      <AppShell
        onCaptureText={async () => undefined}
        clipboardWatcherRunning={true}
        snapshot={{
          boxes: [
            { id: 1, name: "默认", color: "#f97316", description: "", sortOrder: 0 },
            { id: 2, name: "AI", color: "#2563eb", description: "", sortOrder: 1 },
          ],
          items: [],
          panelState: { selectedBoxId: 1 },
        }}
      />
    );

    expect(screen.getByLabelText("自动监听详情")).toHaveTextContent("监听中");
    expect(screen.getByLabelText("自动监听详情")).toHaveTextContent("进入 最近添加");
    expect(screen.queryByLabelText("最近收集")).not.toBeInTheDocument();
  });

  it("renders the main two-column shell", () => {
    const { container } = render(
      <AppShell
        onCaptureText={async () => undefined}
        snapshot={{
          boxes: [
            { id: 1, name: "Inbox", color: "#f97316", description: "Default collection box", sortOrder: 0 },
            { id: 2, name: "Brand", color: "#2563eb", description: "Mood references", sortOrder: 1 },
          ],
          items: [
            {
              id: 11,
              boxId: 2,
              kind: "image",
              title: "Hero ref",
              content: "data:image/png;base64,ZmFrZQ==",
              sourceUrl: "",
              sourcePath: "",
              bundleCount: 0,
              sortOrder: 0,
              createdAt: "2026-04-08T00:00:00.000Z",
              updatedAt: "2026-04-08T00:00:00.000Z",
            },
          ],
          panelState: { selectedBoxId: 2 },
        }}
      />
    );

    expect(container.querySelector(".box-rail")).not.toBeNull();
    expect(screen.getAllByText("Inbox").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Brand").length).toBeGreaterThan(0);
    expect(screen.queryByText("Default collection box")).not.toBeInTheDocument();
    expect(screen.queryByText("Mood references")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "盒子总览" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "展开新建盒子" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开盒子 Inbox" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开盒子 Brand" })).toBeInTheDocument();
    expect(screen.getAllByText("Hero ref")).toHaveLength(1);
    expect(screen.getByTestId("rail-trash")).toBeInTheDocument();
    expect(container.querySelector(".box-overview-grid")).not.toBeNull();
    expect(container.querySelector(".box-overview-sticker-stack")).not.toBeNull();
    expect(container.querySelectorAll(".box-overview-sticker").length).toBeGreaterThan(0);
  });

  it("passes workspace paste through to the capture callback", () => {
    const onCaptureText = vi.fn().mockResolvedValue(undefined);

    render(
      <AppShell
        onCaptureText={onCaptureText}
        snapshot={{
          boxes: [{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }],
          items: [],
          panelState: { selectedBoxId: 1 },
        }}
      />
    );

    fireEvent.paste(screen.getByLabelText("工作区拖放区"), {
      clipboardData: {
        getData: (type: string) => (type === "text" ? "Quick note" : ""),
      },
    });

    expect(onCaptureText).toHaveBeenCalledWith("Quick note");
  });

  it("forwards box clicks to the selection callback", () => {
    const onSelectBox = vi.fn().mockResolvedValue(undefined);

    render(
      <AppShell
        onCaptureText={async () => undefined}
        onSelectBox={onSelectBox}
        snapshot={{
          boxes: [
            { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
            { id: 2, name: "Brand", color: "#2563eb", description: "", sortOrder: 1 },
          ],
          items: [],
          panelState: { selectedBoxId: 1 },
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "打开盒子 Brand" }));

    expect(onSelectBox).toHaveBeenCalledWith(2);
    expect(screen.getByRole("button", { name: "返回盒子总览" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "编辑当前盒子名称 Brand" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "返回盒子总览" }));

    expect(screen.getByRole("heading", { name: "盒子总览" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开盒子 Brand" })).toBeInTheDocument();
  });

  it("searches across boxes from the overview and opens the matching box", () => {
    const onSelectBox = vi.fn().mockResolvedValue(undefined);

    render(
      <AppShell
        onCaptureText={async () => undefined}
        onSelectBox={onSelectBox}
        snapshot={{
          boxes: [
            { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
            { id: 2, name: "Research", color: "#2563eb", description: "", sortOrder: 1 },
          ],
          items: [
            {
              id: 41,
              boxId: 1,
              kind: "text",
              title: "Shopping list",
              content: "Milk and paper",
              sourceUrl: "",
              sourcePath: "",
              bundleCount: 0,
              sortOrder: 0,
              createdAt: "2026-04-08T00:00:00.000Z",
              updatedAt: "2026-04-08T00:00:00.000Z",
            },
            {
              id: 42,
              boxId: 2,
              kind: "link",
              title: "Vector database notes",
              content: "Embedding retrieval reference",
              sourceUrl: "https://example.com/vector",
              sourcePath: "",
              bundleCount: 0,
              sortOrder: 0,
              createdAt: "2026-04-08T00:00:00.000Z",
              updatedAt: "2026-04-08T00:00:00.000Z",
            },
          ],
          panelState: { selectedBoxId: 1 },
        }}
      />
    );

    fireEvent.change(screen.getByLabelText("全局搜索"), { target: { value: "vector" } });

    expect(screen.getByRole("region", { name: "全局搜索结果" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开搜索结果 Vector database notes，位于 Research" })).toBeInTheDocument();
    expect(screen.queryByText("Shopping list")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "打开搜索结果 Vector database notes，位于 Research" }));

    expect(onSelectBox).toHaveBeenCalledWith(2);
    expect(screen.getByRole("button", { name: "编辑当前盒子名称 Research" })).toBeInTheDocument();
    expect(screen.getByLabelText("卡片 Vector database notes")).toBeInTheDocument();
  });

  it("renders backend local search results including automatic captures", async () => {
    const onSearchLocal = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <AppShell
        onCaptureText={async () => undefined}
        onSearchLocal={onSearchLocal}
        localSearchResults={[
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
        ]}
        snapshot={{
          boxes: [{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }],
          items: [],
          panelState: { selectedBoxId: 1 },
        }}
      />
    );

    fireEvent.change(screen.getByLabelText("全局搜索"), { target: { value: "预算" } });

    await waitFor(() => expect(onSearchLocal).toHaveBeenCalledWith("预算"));
    expect(screen.getByRole("button", { name: "打开搜索结果 自动记录 05/04 11:10，位于 自动记录" })).toBeInTheDocument();
    expect(screen.getByText("发票 金额 预 算")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "打开搜索结果 自动记录 05/04 11:10，位于 自动记录" }));

    expect(container.querySelector(".auto-capture-preview-stage img")).toHaveAttribute(
      "src",
      "data:image/png;base64,YnVkZ2V0"
    );
  });

  it("keeps today's uncategorized items only in recent additions", () => {
    const today = new Date().toISOString();

    render(
      <AppShell
        onCaptureText={async () => undefined}
        snapshot={{
          boxes: [
            { id: 1, name: "收件箱", color: "#f97316", description: "", sortOrder: 0 },
            { id: 2, name: "Research", color: "#2563eb", description: "", sortOrder: 1 },
          ],
          items: [
            {
              id: 51,
              boxId: 1,
              kind: "link",
              title: "Today inbox note",
              content: "https://example.com/today",
              sourceUrl: "https://example.com/today",
              sourcePath: "",
              bundleCount: 0,
              sortOrder: 0,
              createdAt: today,
              updatedAt: today,
            },
            {
              id: 52,
              boxId: 1,
              kind: "text",
              title: "Older note",
              content: "Older note",
              sourceUrl: "",
              sourcePath: "",
              bundleCount: 0,
              sortOrder: 1,
              createdAt: "2026-04-08T00:00:00.000Z",
              updatedAt: "2026-04-08T00:00:00.000Z",
            },
          ],
          panelState: { selectedBoxId: 1 },
        }}
      />
    );

    expect(screen.queryByRole("region", { name: "今天收集" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "打开最近添加" }));

    expect(screen.getByRole("button", { name: "查看最近添加 Today inbox note" })).toBeInTheDocument();
  });

  it("shows recent additions and moves them into a chosen box", async () => {
    const onMoveItemToBox = vi.fn().mockResolvedValue(undefined);
    const now = new Date().toISOString();

    render(
      <AppShell
        onCaptureText={async () => undefined}
        onMoveItemToBox={onMoveItemToBox}
        snapshot={{
          boxes: [
            { id: 1, name: "收件箱", color: "#f97316", description: "", sortOrder: 0 },
            { id: 2, name: "项目", color: "#2563eb", description: "", sortOrder: 1 },
          ],
          items: [
            {
              id: 81,
              boxId: 1,
              kind: "text",
              title: "待分类想法",
              content: "待分类想法",
              sourceUrl: "",
              sourcePath: "",
              bundleCount: 0,
              sortOrder: 0,
              createdAt: now,
              updatedAt: now,
            },
          ],
          panelState: { selectedBoxId: 1 },
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "打开最近添加" }));

    expect(screen.getByRole("heading", { name: "最近添加" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看最近添加 待分类想法" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("分类 待分类想法 到盒子"), { target: { value: "2" } });

    expect(onMoveItemToBox).toHaveBeenCalledWith(81, 2);
  });

  it("deletes a recent addition from the recent additions panel", () => {
    const onDeleteItem = vi.fn().mockResolvedValue(undefined);
    const now = new Date().toISOString();

    render(
      <AppShell
        onCaptureText={async () => undefined}
        onDeleteItem={onDeleteItem}
        snapshot={{
          boxes: [
            { id: 1, name: "收件箱", color: "#f97316", description: "", sortOrder: 0 },
            { id: 2, name: "项目", color: "#2563eb", description: "", sortOrder: 1 },
          ],
          items: [
            {
              id: 83,
              boxId: 1,
              kind: "image",
              title: "剪贴板图片",
              content: "data:image/png;base64,ZmFrZQ==",
              sourceUrl: "",
              sourcePath: "",
              bundleCount: 0,
              sortOrder: 0,
              createdAt: now,
              updatedAt: now,
            },
          ],
          panelState: { selectedBoxId: 1 },
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "打开最近添加" }));
    fireEvent.click(screen.getByRole("button", { name: "删除最近添加 剪贴板图片" }));

    expect(onDeleteItem).toHaveBeenCalledWith(83);
  });

  it("opens an image preview from recent additions", () => {
    const now = new Date().toISOString();

    render(
      <AppShell
        onCaptureText={async () => undefined}
        snapshot={{
          boxes: [
            { id: 1, name: "收件箱", color: "#f97316", description: "", sortOrder: 0 },
            { id: 2, name: "项目", color: "#2563eb", description: "", sortOrder: 1 },
          ],
          items: [
            {
              id: 82,
              boxId: 1,
              kind: "image",
              title: "剪贴板图片",
              content: "data:image/png;base64,ZmFrZQ==",
              sourceUrl: "",
              sourcePath: "",
              bundleCount: 0,
              sortOrder: 0,
              createdAt: now,
              updatedAt: now,
            },
          ],
          panelState: { selectedBoxId: 1 },
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "打开最近添加" }));
    fireEvent.click(screen.getByRole("button", { name: "查看最近添加 剪贴板图片" }));

    expect(screen.getByLabelText("工作台图片预览层")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "剪贴板图片 预览大图" })).toBeInTheDocument();
  });

  it("moves a card to a rail box target while dragging from the detail view", async () => {
    const onMoveItemToBox = vi.fn().mockResolvedValue(undefined);
    render(
      <AppShell
        onCaptureText={async () => undefined}
        onMoveItemToBox={onMoveItemToBox}
        snapshot={{
          boxes: [
            { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
            { id: 2, name: "Ideas", color: "#2563eb", description: "", sortOrder: 1 },
          ],
          items: [
            {
              id: 71,
              boxId: 1,
              kind: "text",
              title: "Move me",
              content: "Move me",
              sourceUrl: "",
              sourcePath: "",
              bundleCount: 0,
              sortOrder: 0,
              createdAt: "2026-04-08T00:00:00.000Z",
              updatedAt: "2026-04-08T00:00:00.000Z",
            },
          ],
          panelState: { selectedBoxId: 1 },
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "打开盒子 Inbox" }));

    const dataTransfer = createDataTransfer();
    fireEvent(screen.getByLabelText("卡片 Move me"), createDragEvent("dragstart", dataTransfer));
    fireEvent(screen.getByLabelText("盒子"), createDragEvent("dragenter", dataTransfer));

    const target = screen.getByRole("button", { name: "移动到盒子 Ideas" });
    fireEvent(target, createDragEvent("dragover", dataTransfer));
    fireEvent(target, createDragEvent("drop", dataTransfer));

    await waitFor(() => expect(onMoveItemToBox).toHaveBeenCalledWith(71, 2));
  });

  it("forwards box creation, title rename, and trash deletion", () => {
    const onCreateBox = vi.fn().mockResolvedValue(undefined);
    const onRenameBox = vi.fn().mockResolvedValue(undefined);
    const onDeleteBox = vi.fn().mockResolvedValue(undefined);

    render(
      <AppShell
        onCaptureText={async () => undefined}
        onCreateBox={onCreateBox}
        onRenameBox={onRenameBox}
        onDeleteBox={onDeleteBox}
        snapshot={{
          boxes: [
            { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
            { id: 2, name: "Brand", color: "#2563eb", description: "Old description", sortOrder: 1 },
          ],
          items: [],
          panelState: { selectedBoxId: 2 },
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "展开新建盒子" }));
    fireEvent.change(screen.getByLabelText("新盒子名称"), {
      target: { value: "Visuals" },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加" }));

    fireEvent.click(screen.getByRole("button", { name: "打开盒子 Brand" }));
    fireEvent.click(screen.getByRole("button", { name: "编辑当前盒子名称 Brand" }));
    fireEvent.change(screen.getByLabelText("编辑当前盒子名称"), {
      target: { value: "Library" },
    });
    const renameForm = screen.getByLabelText("编辑当前盒子名称").closest("form");
    expect(renameForm).not.toBeNull();
    if (renameForm) {
      fireEvent.submit(renameForm);
    }

    const dragData = createDataTransfer();
    dragData.setData("application/x-brain-box-id", "2");
    fireEvent(screen.getByTestId("rail-trash"), createDragEvent("drop", dragData));

    expect(onCreateBox).toHaveBeenCalledWith("Visuals");
    expect(onRenameBox).toHaveBeenCalledWith(2, "Library", "Old description");
    expect(onDeleteBox).toHaveBeenCalledWith(2);
  });

  it("does not render the old rail reorder slots in standard mode", () => {
    render(
      <AppShell
        onCaptureText={async () => undefined}
        snapshot={{
          boxes: [
            { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
            { id: 2, name: "Brand", color: "#2563eb", description: "", sortOrder: 1 },
            { id: 3, name: "Visuals", color: "#16a34a", description: "", sortOrder: 2 },
          ],
          items: [],
          panelState: { selectedBoxId: 1 },
        }}
      />
    );

    expect(document.querySelector(".box-drop-slot")).toBeNull();
  });

  it("forwards external drops on a box overview card to the targeted box", () => {
    const onDropToBox = vi.fn().mockResolvedValue(undefined);

    render(
      <AppShell
        onCaptureText={async () => undefined}
        onDropToBox={onDropToBox}
        snapshot={{
          boxes: [
            { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
            { id: 2, name: "Brand", color: "#2563eb", description: "", sortOrder: 1 },
          ],
          items: [],
          panelState: { selectedBoxId: 1 },
        }}
      />
    );

    const brandBox = screen.getByRole("button", { name: "打开盒子 Brand" });
    fireEvent(brandBox, createDropEvent("drop", ["C:\\assets\\hero.png"]));

    expect(onDropToBox).toHaveBeenCalledWith(2, ["C:\\assets\\hero.png"]);
  });

  it("resolves dropped file paths through the desktop bridge for a target box drop", async () => {
    const onDropToBox = vi.fn().mockResolvedValue(undefined);
    const originalApi = window.brainDesktop;
    window.brainDesktop = {
      ...window.brainDesktop,
      getPathsForFiles: vi.fn().mockReturnValue(["C:\\docs\\brief.docx"]),
    };

    render(
      <AppShell
        onCaptureText={async () => undefined}
        onDropToBox={onDropToBox}
        snapshot={{
          boxes: [
            { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
            { id: 2, name: "Brand", color: "#2563eb", description: "", sortOrder: 1 },
          ],
          items: [],
          panelState: { selectedBoxId: 1 },
        }}
      />
    );

    const file = new File(["fake"], "brief.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const dropEvent = new Event("drop", { bubbles: true, cancelable: true }) as Event & {
      dataTransfer?: {
        files: File[];
        items: Array<{ kind: string; type: string; getAsFile(): File | null }>;
        getData(type: string): string;
      };
    };
    Object.defineProperty(dropEvent, "dataTransfer", {
      value: {
        files: [file],
        items: [
          {
            kind: "file",
            type: file.type,
            getAsFile: () => file,
          },
        ],
        getData: () => "",
      },
    });

    fireEvent(screen.getByRole("button", { name: "打开盒子 Brand" }), dropEvent);

    await screen.findByRole("button", { name: "打开盒子 Brand" });
    expect(onDropToBox).toHaveBeenCalledWith(2, ["C:\\docs\\brief.docx"]);
    window.brainDesktop = originalApi;
  });

  it("filters current box items by search text and kind", () => {
    render(
      <AppShell
        onCaptureText={async () => undefined}
        snapshot={{
          boxes: [
            { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
            { id: 2, name: "Brand", color: "#2563eb", description: "", sortOrder: 1 },
          ],
          items: [
            {
              id: 11,
              boxId: 1,
              kind: "text",
              title: "Moodboard idea",
              content: "Warm paper textures",
              sourceUrl: "",
              sourcePath: "",
              bundleCount: 0,
              sortOrder: 0,
              createdAt: "2026-04-08T00:00:00.000Z",
              updatedAt: "2026-04-08T00:00:00.000Z",
            },
            {
              id: 12,
              boxId: 1,
              kind: "link",
              title: "Color reference",
              content: "Palette study",
              sourceUrl: "",
              sourcePath: "",
              bundleCount: 0,
              sortOrder: 1,
              createdAt: "2026-04-08T00:00:00.000Z",
              updatedAt: "2026-04-08T00:00:00.000Z",
            },
            {
              id: 13,
              boxId: 1,
              kind: "bundle",
              title: "Asset pack",
              content: "",
              sourceUrl: "",
              sourcePath: "",
              bundleCount: 3,
              sortOrder: 2,
              createdAt: "2026-04-08T00:00:00.000Z",
              updatedAt: "2026-04-08T00:00:00.000Z",
            },
            {
              id: 14,
              boxId: 2,
              kind: "image",
              title: "Other box image",
              content: "",
              sourceUrl: "",
              sourcePath: "",
              bundleCount: 0,
              sortOrder: 0,
              createdAt: "2026-04-08T00:00:00.000Z",
              updatedAt: "2026-04-08T00:00:00.000Z",
            },
          ],
          panelState: { selectedBoxId: 1 },
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "打开盒子 Inbox" }));
    fireEvent.change(screen.getByLabelText("筛选当前盒子"), {
      target: { value: "color" },
    });

    expect(screen.queryByLabelText("卡片 Moodboard idea")).not.toBeInTheDocument();
    expect(screen.getByLabelText("卡片 Color reference")).toBeInTheDocument();
    expect(screen.queryByLabelText("卡片 Asset pack")).not.toBeInTheDocument();
    expect(screen.getByText("1 / 3 张卡片")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("筛选当前盒子"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "组合" }));

    expect(screen.queryByLabelText("卡片 Moodboard idea")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("卡片 Color reference")).not.toBeInTheDocument();
    expect(screen.getByLabelText("卡片 Asset pack")).toBeInTheDocument();
    expect(screen.getByText("1 / 3 张卡片")).toBeInTheDocument();
  });

  it("does not render the old bulk action toolbar", () => {
    render(
      <AppShell
        onCaptureText={async () => undefined}
        snapshot={{
          boxes: [
            { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
            { id: 2, name: "Brand", color: "#2563eb", description: "", sortOrder: 1 },
          ],
          items: [
            {
              id: 21,
              boxId: 1,
              kind: "text",
              title: "Alpha note",
              content: "Alpha note",
              sourceUrl: "",
              sourcePath: "",
              bundleCount: 0,
              sortOrder: 0,
              createdAt: "2026-04-08T00:00:00.000Z",
              updatedAt: "2026-04-08T00:00:00.000Z",
            },
            {
              id: 22,
              boxId: 1,
              kind: "link",
              title: "Beta link",
              content: "Beta link",
              sourceUrl: "",
              sourcePath: "",
              bundleCount: 0,
              sortOrder: 1,
              createdAt: "2026-04-08T00:00:00.000Z",
              updatedAt: "2026-04-08T00:00:00.000Z",
            },
          ],
          panelState: { selectedBoxId: 1 },
        }}
      />
    );

    expect(screen.queryByLabelText("选择卡片 Alpha note")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("移动所选卡片")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "移动所选" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "删除所选卡片" })).not.toBeInTheDocument();
  });

  it("shows the image preview over the workbench area when an image card is clicked", () => {
    render(
      <AppShell
        onCaptureText={async () => undefined}
        snapshot={{
          boxes: [{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }],
          items: [
            {
              id: 31,
              boxId: 1,
              kind: "image",
              title: "image.png",
              content: "data:image/png;base64,ZmFrZQ==",
              sourceUrl: "",
              sourcePath: "",
              bundleCount: 0,
              sortOrder: 0,
              createdAt: "2026-04-08T00:00:00.000Z",
              updatedAt: "2026-04-08T00:00:00.000Z",
            },
            {
              id: 32,
              boxId: 1,
              kind: "link",
              title: "Hermes Agent",
              content: "https://github.com/NousResearch/hermes-agent",
              sourceUrl: "https://github.com/NousResearch/hermes-agent",
              sourcePath: "",
              bundleCount: 0,
              sortOrder: 1,
              createdAt: "2026-04-08T00:00:00.000Z",
              updatedAt: "2026-04-08T00:00:00.000Z",
            },
          ],
          panelState: { selectedBoxId: 1 },
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "打开盒子 Inbox" }));
    fireEvent.click(screen.getByRole("button", { name: "放大查看 image.png" }));

    expect(screen.getByLabelText("工作台图片预览层")).toBeInTheDocument();
    const previewStage = screen.getByLabelText("滚轮缩放查看图片");
    expect(previewStage).toHaveAttribute("tabindex", "0");
    expect(previewStage.querySelector(".image-preview-viewport")).not.toBeNull();
    const previewImage = screen.getByRole("img", { name: "image.png 预览大图" });
    expect(previewImage).toBeInTheDocument();
    const inlineStyle = previewImage.getAttribute("style") ?? "";
    expect(inlineStyle).toContain("transform: scale(1)");
    expect(inlineStyle).toContain("transform-origin: 50% 50%");

    fireEvent.click(screen.getByRole("button", { name: "关闭图片预览" }));

    expect(screen.queryByLabelText("工作台图片预览层")).not.toBeInTheDocument();
  });

  it("zooms image previews around the cursor on wheel", () => {
    render(
      <AppShell
        onCaptureText={async () => undefined}
        snapshot={{
          boxes: [{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }],
          items: [
            {
              id: 31,
              boxId: 1,
              kind: "image",
              title: "image.png",
              content: "data:image/png;base64,ZmFrZQ==",
              sourceUrl: "",
              sourcePath: "",
              bundleCount: 0,
              sortOrder: 0,
              createdAt: "2026-04-08T00:00:00.000Z",
              updatedAt: "2026-04-08T00:00:00.000Z",
            },
          ],
          panelState: { selectedBoxId: 1 },
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "打开盒子 Inbox" }));
    fireEvent.click(screen.getByRole("button", { name: "放大查看 image.png" }));

    const previewStage = screen.getByLabelText("滚轮缩放查看图片");
    const previewImage = screen.getByRole("img", { name: "image.png 预览大图" });

    vi.spyOn(previewStage, "getBoundingClientRect").mockReturnValue({
      x: 100,
      y: 50,
      left: 100,
      top: 50,
      right: 700,
      bottom: 450,
      width: 600,
      height: 400,
      toJSON: () => ({}),
    });

    fireEvent.wheel(previewStage, { deltaY: -120, clientX: 400, clientY: 250 });

    expect(previewImage).toHaveStyle({
      transformOrigin: "50% 50%",
      transform: "scale(1.12)",
    });
  });
});
