import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./app";
import type { WorkbenchSnapshot } from "./shared/types";

const electronMocks = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn().mockResolvedValue(undefined),
}));

const initialSnapshot: WorkbenchSnapshot = {
  boxes: [{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }],
  items: [],
  panelState: { selectedBoxId: 1, quickPanelOpen: true },
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
  },
}));

beforeEach(() => {
  vi.useRealTimers();
  window.brainDesktop = {
    bootstrap: vi.fn().mockResolvedValue(initialSnapshot),
    setSimpleMode: vi.fn(),
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
    deleteItem: vi.fn(),
    updateItemTitle: vi.fn(),
    removeBundleEntry: vi.fn(),
    openPath: vi.fn(),
    openExternal: vi.fn(),
    copyText: vi.fn(),
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

  it("captures a text note from workspace paste", async () => {
    const captureTextOrLink = vi.fn().mockResolvedValue({
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
      captureTextOrLink,
    };

    render(<App />);

    fireEvent.paste(await screen.findByLabelText("工作区拖放区"), {
      clipboardData: {
        getData: (type: string) => (type === "text" ? "Quick note" : ""),
      },
    });

    await waitFor(() => expect(captureTextOrLink).toHaveBeenCalledWith("Quick note"));
    expect((await screen.findAllByText("Quick note")).length).toBeGreaterThan(0);
  });

  it("captures workspace paste only once", async () => {
    const captureTextOrLink = vi.fn().mockResolvedValue({
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
      captureTextOrLink,
    };

    render(<App />);

    fireEvent.paste(await screen.findByLabelText("工作区拖放区"), {
      clipboardData: {
        getData: (type: string) => (type === "text" ? "Once" : ""),
        items: [],
        files: [],
      },
    });

    await waitFor(() => expect(captureTextOrLink).toHaveBeenCalledTimes(1));
  });

  it("refreshes a link title after enrichment", async () => {
    const captureTextOrLink = vi.fn().mockResolvedValue({
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
      captureTextOrLink,
      enrichLinkTitle,
    };

    render(<App />);

    fireEvent.paste(await screen.findByLabelText("工作区拖放区"), {
      clipboardData: {
        getData: (type: string) => (type === "text" ? "https://example.com" : ""),
      },
    });

    await waitFor(() => expect(captureTextOrLink).toHaveBeenCalledWith("https://example.com"));
    await waitFor(() => expect(enrichLinkTitle).toHaveBeenCalledWith(3, "https://example.com"));
    expect((await screen.findAllByText("Example Domain")).length).toBeGreaterThan(0);
  });

  it("captures dropped files into the current workspace", async () => {
    const captureDroppedPaths = vi.fn().mockResolvedValue({
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
      captureDroppedPaths,
    };

    render(<App />);

    fireEvent(
      await screen.findByLabelText("工作区拖放区"),
      createFileDropEvent("drop", ["C:\\assets\\hero.png"])
    );

    await waitFor(() => expect(captureDroppedPaths).toHaveBeenCalledWith(["C:\\assets\\hero.png"]));
    expect((await screen.findAllByText("hero.png")).length).toBeGreaterThan(0);
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
      panelState: { selectedBoxId: 2, quickPanelOpen: true },
    };
    const selectBox = vi.fn().mockResolvedValue(selectedSnapshot);

    window.brainDesktop = {
      ...window.brainDesktop,
      bootstrap: vi.fn().mockResolvedValue({
        boxes: selectedSnapshot.boxes,
        items: [],
        panelState: { selectedBoxId: 1, quickPanelOpen: true },
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
      panelState: { selectedBoxId: 1, quickPanelOpen: true },
    };
    const createBox = vi.fn().mockResolvedValue({
      ...baseSnapshot,
      boxes: [...baseSnapshot.boxes, { id: 3, name: "Visuals", color: "#16a34a", description: "", sortOrder: 2 }],
      panelState: { selectedBoxId: 3, quickPanelOpen: true },
    });
    const reorderBox = vi.fn().mockResolvedValue({
      ...baseSnapshot,
      boxes: [
        baseSnapshot.boxes[0],
        { id: 3, name: "Visuals", color: "#16a34a", description: "", sortOrder: 1 },
        { ...baseSnapshot.boxes[1], sortOrder: 2 },
      ],
      panelState: { selectedBoxId: 3, quickPanelOpen: true },
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
      panelState: { selectedBoxId: 2, quickPanelOpen: true },
    };
    const deleteBox = vi.fn().mockResolvedValue({
      boxes: [baseSnapshot.boxes[0]],
      items: [{ ...baseSnapshot.items[0], boxId: 1 }],
      panelState: { selectedBoxId: 1, quickPanelOpen: true },
    });

    window.brainDesktop = {
      ...window.brainDesktop,
      bootstrap: vi.fn().mockResolvedValue(baseSnapshot),
      deleteBox,
    };

    render(<App />);

    const dragData = createDataTransfer();
    dragData.setData("application/x-brain-box-id", "2");
    fireEvent(await screen.findByTestId("quick-panel-trash"), createDragEvent("drop", dragData));

    await waitFor(() => expect(deleteBox).toHaveBeenCalledWith(2));
    expect(await screen.findByText("已删除 Brand，并将 1 张卡片移到 Inbox")).toBeInTheDocument();
    expect((await screen.findAllByText("Brand note")).length).toBeGreaterThan(0);
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
      panelState: { selectedBoxId: 1, quickPanelOpen: true },
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
      panelState: { selectedBoxId: 1, quickPanelOpen: true },
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
      panelState: { selectedBoxId: 1, quickPanelOpen: true },
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

    const captureImageData = vi.fn().mockResolvedValue({
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
      captureImageData,
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
      expect(captureImageData).toHaveBeenCalledWith("data:image/png;base64,ZmFrZQ==", "shot.png")
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

    const captureImageData = vi
      .fn()
      .mockRejectedValue(
        new Error(
          "Error invoking remote method 'workbench/capture-image-data': Error: No handler registered for 'workbench/capture-image-data'"
        )
      );

    window.brainDesktop = {
      ...window.brainDesktop,
      captureImageData,
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
      panelState: { selectedBoxId: 1, quickPanelOpen: true },
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
    const trash = await screen.findByTestId("quick-panel-trash");
    vi.useFakeTimers();

    const dragData = createDataTransfer();
    dragData.setData("application/x-brain-item-id", "36");
    fireEvent(trash, createDragEvent("drop", dragData));
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText("已删除 Delete me")).toBeInTheDocument();
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
      panelState: { selectedBoxId: 1, quickPanelOpen: true },
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

    fireEvent.click(await screen.findByRole("button", { name: "编辑 Original title 的标题" }));
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
      panelState: { selectedBoxId: 1, quickPanelOpen: true },
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
      panelState: { selectedBoxId: 1, quickPanelOpen: true },
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
    expect(await screen.findByText("已移除 C:\\assets\\missing")).toBeInTheDocument();
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
      panelState: { selectedBoxId: 1, quickPanelOpen: true },
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
      panelState: { selectedBoxId: 2, quickPanelOpen: true },
    };
    const selectBox = vi.fn().mockResolvedValue(selectedSnapshot);

    window.brainDesktop = {
      ...window.brainDesktop,
      bootstrap: vi.fn().mockResolvedValue({
        boxes: selectedSnapshot.boxes,
        items: [],
        panelState: { selectedBoxId: 1, quickPanelOpen: true },
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
      panelState: { selectedBoxId: 1, quickPanelOpen: true },
    };
    const createBox = vi.fn().mockResolvedValue({
      ...baseSnapshot,
      boxes: [...baseSnapshot.boxes, { id: 3, name: "Visuals", color: "#16a34a", description: "", sortOrder: 2 }],
      panelState: { selectedBoxId: 3, quickPanelOpen: true },
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
      panelState: { selectedBoxId: 1, quickPanelOpen: true },
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
      panelState: { selectedBoxId: 1, quickPanelOpen: true },
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
      panelState: { selectedBoxId: 1, quickPanelOpen: true },
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
      panelState: { selectedBoxId: 1, quickPanelOpen: true },
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
    fireEvent.click(await screen.findByRole("button", { name: "编辑 Original title 的标题" }));
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
      panelState: { selectedBoxId: 1, quickPanelOpen: true },
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

  it("expands a bundle card and removes one path after opening the current box", async () => {
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
      panelState: { selectedBoxId: 1, quickPanelOpen: true },
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
    fireEvent.click(await screen.findByRole("button", { name: "展开 Dropped bundle 的内容" }));

    await waitFor(() => expect(getBundleEntries).toHaveBeenCalledWith(53));
    expect(await screen.findByText("路径缺失")).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "移除 C:\\assets\\missing" }));

    await waitFor(() => expect(removeBundleEntry).toHaveBeenCalledWith(53, "C:\\assets\\missing"));
    expect(await screen.findByText("已移除 C:\\assets\\missing")).toBeInTheDocument();
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
      panelState: { selectedBoxId: 1, quickPanelOpen: true },
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
});

describe("preload bridge", () => {
  beforeEach(() => {
    electronMocks.exposeInMainWorld.mockClear();
    electronMocks.invoke.mockClear();
    vi.resetModules();
  });

  it("exposes capture and card action methods", async () => {
    await import("./preload");

    expect(electronMocks.exposeInMainWorld).toHaveBeenCalledWith(
      "brainDesktop",
      expect.objectContaining({
        bootstrap: expect.any(Function),
        setSimpleMode: expect.any(Function),
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
        deleteItem: expect.any(Function),
        updateItemTitle: expect.any(Function),
        removeBundleEntry: expect.any(Function),
        selectBox: expect.any(Function),
        openPath: expect.any(Function),
        openExternal: expect.any(Function),
        copyText: expect.any(Function),
        enrichLinkTitle: expect.any(Function),
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
      setSimpleMode: (enabled: boolean) => Promise<unknown>;
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
      deleteItem: (itemId: number) => Promise<unknown>;
      updateItemTitle: (itemId: number, title: string) => Promise<unknown>;
      removeBundleEntry: (itemId: number, entryPath: string) => Promise<unknown>;
      selectBox: (boxId: number) => Promise<unknown>;
      openPath: (path: string) => Promise<unknown>;
      openExternal: (url: string) => Promise<unknown>;
      copyText: (text: string) => Promise<unknown>;
      enrichLinkTitle: (itemId: number, url: string) => Promise<unknown>;
      moveItemToBox: (itemId: number, boxId: number) => Promise<unknown>;
      moveItemToIndex: (itemId: number, targetIndex: number) => Promise<unknown>;
      reorderItem: (itemId: number, direction: "up" | "down") => Promise<unknown>;
      getBundleEntries: (itemId: number) => Promise<unknown>;
    };

    await exposedApi.bootstrap();
    await exposedApi.setSimpleMode(true);
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
    await exposedApi.deleteItem(42);
    await exposedApi.updateItemTitle(42, "Renamed");
    await exposedApi.removeBundleEntry(42, "C:\\assets\\missing");
    await exposedApi.selectBox(7);
    await exposedApi.openPath("C:\\assets\\hero.png");
    await exposedApi.openExternal("https://example.com");
    await exposedApi.copyText("C:\\assets\\hero.png");
    await exposedApi.enrichLinkTitle(42, "https://example.com");
    await exposedApi.moveItemToBox(42, 7);
    await exposedApi.moveItemToIndex(42, 3);
    await exposedApi.reorderItem(42, "down");
    await exposedApi.getBundleEntries(42);

    expect(electronMocks.invoke).toHaveBeenNthCalledWith(1, "workbench/bootstrap");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(2, "workbench/set-simple-mode", true);
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(3, "workbench/capture-text-or-link", "Quick note");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(4, "workbench/capture-text-or-link-into-box", "Quick note", 7);
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(
      5,
      "workbench/capture-image-data",
      "data:image/png;base64,ZmFrZQ==",
      "shot.png"
    );
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(
      6,
      "workbench/capture-image-data-into-box",
      "data:image/png;base64,ZmFrZQ==",
      "shot.png",
      7
    );
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(7, "workbench/capture-dropped-paths", ["C:\\assets\\hero.png"]);
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(
      8,
      "workbench/capture-dropped-paths-into-box",
      ["C:\\assets\\hero.png"],
      7
    );
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(9, "workbench/create-box", "Visuals");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(10, "workbench/update-box", 7, "Library", "Saved references");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(11, "workbench/reorder-box", 7, "up");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(12, "workbench/delete-box", 7);
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(13, "workbench/delete-item", 42);
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(14, "workbench/update-item-title", 42, "Renamed");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(15, "workbench/remove-bundle-entry", 42, "C:\\assets\\missing");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(16, "workbench/select-box", 7);
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(17, "workbench/open-path", "C:\\assets\\hero.png");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(18, "workbench/open-external", "https://example.com");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(19, "workbench/copy-text", "C:\\assets\\hero.png");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(20, "workbench/enrich-link-title", 42, "https://example.com");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(21, "workbench/move-item-to-box", 42, 7);
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(22, "workbench/move-item-to-index", 42, 3);
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(23, "workbench/reorder-item", 42, "down");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(24, "workbench/get-bundle-entries", 42);
  });
});
