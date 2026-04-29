import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
});

describe("AppShell", () => {
  it("switches to settings and about panels from the rail navigation", () => {
    render(
      <AppShell
        onQuickCapture={async () => undefined}
        snapshot={{
          boxes: [{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }],
          items: [],
          panelState: { selectedBoxId: 1, quickPanelOpen: true },
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "打开设置" }));
    expect(screen.getByRole("heading", { name: "应用设置" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "打开关于" }));
    expect(screen.getByRole("heading", { name: "Brain Desktop" })).toBeInTheDocument();
    expect(screen.getByText("Ctrl+Shift+B 收集剪贴板；Ctrl+Alt+B 开启或关闭自动监听。")).toBeInTheDocument();
  });

  it("shows a watcher toggle and capture target selector on the home header", () => {
    const onToggleClipboardWatcher = vi.fn().mockResolvedValue(undefined);
    const onSetClipboardCaptureBox = vi.fn().mockResolvedValue(undefined);

    render(
      <AppShell
        onQuickCapture={async () => undefined}
        clipboardWatcherRunning={false}
        clipboardCaptureBoxId={1}
        onToggleClipboardWatcher={onToggleClipboardWatcher}
        onSetClipboardCaptureBox={onSetClipboardCaptureBox}
        snapshot={{
          boxes: [
            { id: 1, name: "默认", color: "#f97316", description: "", sortOrder: 0 },
            { id: 2, name: "AI", color: "#2563eb", description: "", sortOrder: 1 },
          ],
          items: [],
          panelState: { selectedBoxId: 2, quickPanelOpen: true },
        }}
      />
    );

    expect(screen.getByRole("button", { name: "自动监听：关" })).toBeInTheDocument();
    expect(screen.queryByText("Ctrl+Shift+B 收集剪贴板")).not.toBeInTheDocument();
    expect(screen.getByLabelText("剪贴板进入盒子")).toHaveValue("1");

    fireEvent.click(screen.getByRole("button", { name: "自动监听：关" }));
    fireEvent.change(screen.getByLabelText("剪贴板进入盒子"), { target: { value: "2" } });

    expect(onToggleClipboardWatcher).toHaveBeenCalledTimes(1);
    expect(onSetClipboardCaptureBox).toHaveBeenCalledWith(2);
  });

  it("enters simple mode from the rail navigation", () => {
    const onEnterSimpleMode = vi.fn().mockResolvedValue(undefined);

    render(
      <AppShell
        onQuickCapture={async () => undefined}
        onEnterSimpleMode={onEnterSimpleMode}
        snapshot={{
          boxes: [{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }],
          items: [],
          panelState: { selectedBoxId: 1, quickPanelOpen: true },
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "进入简易模式" }));
    expect(onEnterSimpleMode).toHaveBeenCalled();
  });

  it("renders the main two-column shell", () => {
    const { container } = render(
      <AppShell
        onQuickCapture={async () => undefined}
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
          panelState: { selectedBoxId: 2, quickPanelOpen: true },
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
    expect(screen.getByTestId("quick-panel-trash")).toBeInTheDocument();
    expect(container.querySelector(".box-overview-grid")).not.toBeNull();
    expect(container.querySelector(".box-overview-sticker-stack")).not.toBeNull();
    expect(container.querySelectorAll(".box-overview-sticker").length).toBeGreaterThan(0);
  });

  it("passes workspace paste through to the capture callback", () => {
    const onQuickCapture = vi.fn().mockResolvedValue(undefined);

    render(
      <AppShell
        onQuickCapture={onQuickCapture}
        snapshot={{
          boxes: [{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }],
          items: [],
          panelState: { selectedBoxId: 1, quickPanelOpen: true },
        }}
      />
    );

    fireEvent.paste(screen.getByLabelText("工作区拖放区"), {
      clipboardData: {
        getData: (type: string) => (type === "text" ? "Quick note" : ""),
      },
    });

    expect(onQuickCapture).toHaveBeenCalledWith("Quick note");
  });

  it("forwards box clicks to the selection callback", () => {
    const onSelectBox = vi.fn().mockResolvedValue(undefined);

    render(
      <AppShell
        onQuickCapture={async () => undefined}
        onSelectBox={onSelectBox}
        snapshot={{
          boxes: [
            { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
            { id: 2, name: "Brand", color: "#2563eb", description: "", sortOrder: 1 },
          ],
          items: [],
          panelState: { selectedBoxId: 1, quickPanelOpen: true },
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "打开盒子 Brand" }));

    expect(onSelectBox).toHaveBeenCalledWith(2);
    expect(screen.getByRole("button", { name: "返回主界面" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "编辑当前盒子名称 Brand" })).toBeInTheDocument();
  });

  it("forwards box creation, title rename, and trash deletion", () => {
    const onCreateBox = vi.fn().mockResolvedValue(undefined);
    const onRenameBox = vi.fn().mockResolvedValue(undefined);
    const onDeleteBox = vi.fn().mockResolvedValue(undefined);

    render(
      <AppShell
        onQuickCapture={async () => undefined}
        onCreateBox={onCreateBox}
        onRenameBox={onRenameBox}
        onDeleteBox={onDeleteBox}
        snapshot={{
          boxes: [
            { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
            { id: 2, name: "Brand", color: "#2563eb", description: "Old description", sortOrder: 1 },
          ],
          items: [],
          panelState: { selectedBoxId: 2, quickPanelOpen: true },
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
    fireEvent(screen.getByTestId("quick-panel-trash"), createDragEvent("drop", dragData));

    expect(onCreateBox).toHaveBeenCalledWith("Visuals");
    expect(onRenameBox).toHaveBeenCalledWith(2, "Library", "Old description");
    expect(onDeleteBox).toHaveBeenCalledWith(2);
  });

  it("does not render the old rail reorder slots in standard mode", () => {
    render(
      <AppShell
        onQuickCapture={async () => undefined}
        snapshot={{
          boxes: [
            { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
            { id: 2, name: "Brand", color: "#2563eb", description: "", sortOrder: 1 },
            { id: 3, name: "Visuals", color: "#16a34a", description: "", sortOrder: 2 },
          ],
          items: [],
          panelState: { selectedBoxId: 1, quickPanelOpen: true },
        }}
      />
    );

    expect(document.querySelector(".box-drop-slot")).toBeNull();
  });

  it("forwards external drops on a box overview card to the targeted box", () => {
    const onDropToBox = vi.fn().mockResolvedValue(undefined);

    render(
      <AppShell
        onQuickCapture={async () => undefined}
        onDropToBox={onDropToBox}
        snapshot={{
          boxes: [
            { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
            { id: 2, name: "Brand", color: "#2563eb", description: "", sortOrder: 1 },
          ],
          items: [],
          panelState: { selectedBoxId: 1, quickPanelOpen: true },
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
        onQuickCapture={async () => undefined}
        onDropToBox={onDropToBox}
        snapshot={{
          boxes: [
            { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
            { id: 2, name: "Brand", color: "#2563eb", description: "", sortOrder: 1 },
          ],
          items: [],
          panelState: { selectedBoxId: 1, quickPanelOpen: true },
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
        onQuickCapture={async () => undefined}
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
          panelState: { selectedBoxId: 1, quickPanelOpen: true },
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
        onQuickCapture={async () => undefined}
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
          panelState: { selectedBoxId: 1, quickPanelOpen: true },
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
        onQuickCapture={async () => undefined}
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
          panelState: { selectedBoxId: 1, quickPanelOpen: true },
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
        onQuickCapture={async () => undefined}
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
          panelState: { selectedBoxId: 1, quickPanelOpen: true },
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
