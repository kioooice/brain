import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MainCanvas } from "./main-canvas";

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

function mockImageSize(image: Element, width: number, height: number) {
  Object.defineProperty(image, "naturalWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(image, "naturalHeight", {
    configurable: true,
    value: height,
  });
}

afterEach(() => {
  cleanup();
});

describe("MainCanvas", () => {
  it("renders cards in masonry layout with row spans", () => {
    const { container } = render(
      <MainCanvas
        box={{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }}
        items={[
          {
            id: 11,
            boxId: 1,
            kind: "text",
            title: "Alpha",
            content: "Alpha",
            sourceUrl: "",
            sourcePath: "",
            bundleCount: 0,
            sortOrder: 0,
            createdAt: "2026-04-08T00:00:00.000Z",
            updatedAt: "2026-04-08T00:00:00.000Z",
          },
        ]}
      />
    );

    expect(container.querySelector(".card-grid")).toHaveAttribute("data-layout", "masonry");
    expect(container.querySelector(".card-stack")).toHaveAttribute("data-row-span");
  });

  it("renders a compact topbar that groups the box header and filters", () => {
    const { container } = render(
      <MainCanvas
        box={{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }}
        items={[]}
        onBackToWorkspace={() => undefined}
      />
    );

    expect(container.querySelector(".canvas-topbar")).not.toBeNull();
    expect(container.querySelector(".canvas-header-kicker")).not.toBeNull();
    expect(container.querySelector(".canvas-topbar .canvas-toolbar")).not.toBeNull();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "全部" })).toHaveAttribute("aria-pressed", "true");
  });

  it("filters card kinds through inline filter pills", () => {
    render(
      <MainCanvas
        box={{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }}
        items={[
          {
            id: 31,
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
            id: 32,
            boxId: 1,
            kind: "file",
            title: "brief.docx",
            content: "C:\\docs\\brief.docx",
            sourceUrl: "",
            sourcePath: "C:\\docs\\brief.docx",
            bundleCount: 0,
            sortOrder: 1,
            createdAt: "2026-04-08T00:00:00.000Z",
            updatedAt: "2026-04-08T00:00:00.000Z",
          },
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "文件" }));

    expect(screen.getByRole("button", { name: "文件" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByLabelText("卡片 Alpha note")).not.toBeInTheDocument();
    expect(screen.getByLabelText("卡片 brief.docx")).toBeInTheDocument();
  });

  it("renders the empty state outside the masonry grid", () => {
    const { container } = render(
      <MainCanvas
        box={{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }}
        items={[]}
      />
    );

    expect(container.querySelector(".empty-state-panel")).not.toBeNull();
    expect(container.querySelector(".card-grid")).toBeNull();
  });

  it("renames the current box and a non-text card by clicking their titles", async () => {
    const onRenameBox = vi.fn().mockResolvedValue(undefined);
    const onRenameItem = vi.fn().mockResolvedValue(undefined);

    render(
      <MainCanvas
        box={{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }}
        items={[
          {
            id: 11,
            boxId: 1,
            kind: "link",
            title: "Alpha",
            content: "https://example.com/alpha",
            sourceUrl: "https://example.com/alpha",
            sourcePath: "",
            bundleCount: 0,
            sortOrder: 0,
            createdAt: "2026-04-08T00:00:00.000Z",
            updatedAt: "2026-04-08T00:00:00.000Z",
          },
        ]}
        onRenameBox={onRenameBox}
        onRenameItem={onRenameItem}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "编辑当前盒子名称 Inbox" }));
    fireEvent.change(screen.getByLabelText("编辑当前盒子名称"), {
      target: { value: "Brand" },
    });
    const renameBoxForm = screen.getByLabelText("编辑当前盒子名称").closest("form");
    expect(renameBoxForm).not.toBeNull();
    if (renameBoxForm) {
      fireEvent.submit(renameBoxForm);
    }

    fireEvent.click(screen.getByRole("button", { name: /Alpha/ }));
    const renameItemInput = screen.getByDisplayValue("Alpha");
    fireEvent.change(renameItemInput, {
      target: { value: "Renamed Alpha" },
    });
    const renameItemForm = renameItemInput.closest("form");
    expect(renameItemForm).not.toBeNull();
    if (renameItemForm) {
      fireEvent.submit(renameItemForm);
    }

    await waitFor(() => expect(onRenameBox).toHaveBeenCalledWith(1, "Brand", ""));
    await waitFor(() => expect(onRenameItem).toHaveBeenCalledWith(11, "Renamed Alpha"));
  });

  it("does not repeat the body when a text card content equals its title", () => {
    const repeated = "Telegram, Discord, Slack";

    render(
      <MainCanvas
        box={{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }}
        items={[
          {
            id: 12,
            boxId: 1,
            kind: "text",
            title: repeated,
            content: repeated,
            sourceUrl: "",
            sourcePath: "",
            bundleCount: 0,
            sortOrder: 0,
            createdAt: "2026-04-08T00:00:00.000Z",
            updatedAt: "2026-04-08T00:00:00.000Z",
          },
        ]}
      />
    );

    expect(screen.getAllByText(repeated)).toHaveLength(1);
    expect(screen.queryByRole("button", { name: new RegExp(repeated) })).not.toBeInTheDocument();
  });

  it("renders text cards as one selectable text block", () => {
    render(
      <MainCanvas
        box={{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }}
        items={[
          {
            id: 14,
            boxId: 1,
            kind: "text",
            title: "Plain note",
            content: "Plain note",
            sourceUrl: "",
            sourcePath: "",
            bundleCount: 0,
            sortOrder: 0,
            createdAt: "2026-04-08T00:00:00.000Z",
            updatedAt: "2026-04-08T00:00:00.000Z",
          },
        ]}
      />
    );

    expect(screen.getByText("Plain note")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Plain note/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText("卡片 Plain note")).toHaveAttribute("draggable", "true");
  });

  it("renders clickable links for link cards", () => {
    render(
      <MainCanvas
        box={{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }}
        items={[
          {
            id: 13,
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
        ]}
      />
    );

    expect(screen.getByRole("link", { name: "打开 https://github.com/NousResearch/hermes-agent" })).toHaveAttribute(
      "href",
      "https://github.com/NousResearch/hermes-agent"
    );
    expect(
      screen.queryByRole("button", {
        name: "在浏览器打开 https://github.com/NousResearch/hermes-agent",
      })
    ).not.toBeInTheDocument();
  });

  it("forwards image preview requests when an image card is clicked", () => {
    const onPreviewImage = vi.fn();

    render(
      <MainCanvas
        box={{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }}
        items={[
          {
            id: 15,
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
        ]}
        onPreviewImage={onPreviewImage}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "放大查看 截图" }));

    expect(onPreviewImage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 15,
        kind: "image",
        title: "截图",
      })
    );
  });

  it("applies different height strategies to file, text, and image cards", () => {
    const { container } = render(
      <MainCanvas
        box={{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }}
        items={[
          {
            id: 16,
            boxId: 1,
            kind: "file",
            title: "brief.docx",
            content: "C:\\Users\\Administrator\\Desktop\\openclaw搴旂敤\\brief.docx",
            sourceUrl: "",
            sourcePath: "C:\\Users\\Administrator\\Desktop\\openclaw搴旂敤\\brief.docx",
            bundleCount: 0,
            sortOrder: 0,
            createdAt: "2026-04-08T00:00:00.000Z",
            updatedAt: "2026-04-08T00:00:00.000Z",
          },
          {
            id: 17,
            boxId: 1,
            kind: "text",
            title: "Long note",
            content: "Long note content that should read like a denser text card.",
            sourceUrl: "",
            sourcePath: "",
            bundleCount: 0,
            sortOrder: 1,
            createdAt: "2026-04-08T00:00:00.000Z",
            updatedAt: "2026-04-08T00:00:00.000Z",
          },
          {
            id: 19,
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
          },
        ]}
      />
    );

    const stacks = container.querySelectorAll(".card-stack");

    expect(container.querySelector(".work-card.kind-file")).toHaveClass("work-card-compact");
    expect(container.querySelector(".work-card.kind-text")).toHaveClass("work-card-reading");
    expect(container.querySelector(".work-card.kind-image")).toHaveClass("work-card-visual");
    expect(stacks[0]).toHaveClass("card-stack-compact", "card-stack-priority-compact");
    expect(stacks[1]).toHaveClass("card-stack-reading", "card-stack-priority-main");
    expect(stacks[2]).toHaveClass("card-stack-visual", "card-stack-priority-visual");
    expect(screen.getByText("DOCX")).toBeInTheDocument();
    expect(screen.getByText("Desktop / openclaw搴旂敤 / brief.docx")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开 C:\\Users\\Administrator\\Desktop\\openclaw搴旂敤\\brief.docx" })).toHaveAttribute(
      "title",
      "C:\\Users\\Administrator\\Desktop\\openclaw搴旂敤\\brief.docx"
    );
  });

  it("opens a file from its clickable path and removes the old file action buttons", () => {
    const onOpenPath = vi.fn().mockResolvedValue(undefined);

    render(
      <MainCanvas
        box={{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }}
        items={[
          {
            id: 18,
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
        ]}
        onOpenPath={onOpenPath}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "打开 C:\\docs\\notes.pdf" }));

    expect(onOpenPath).toHaveBeenCalledWith("C:\\docs\\notes.pdf");
    expect(screen.queryByText("澶嶅埗璺緞")).not.toBeInTheDocument();
  });

  it("groups one card onto another card through direct card drop", async () => {
    const onGroupItems = vi.fn().mockResolvedValue(undefined);

    render(
      <MainCanvas
        box={{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }}
        items={[
          {
            id: 21,
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
            id: 22,
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
        ]}
        onGroupItems={onGroupItems}
      />
    );

    const dataTransfer = createDataTransfer();
    fireEvent(screen.getByLabelText("卡片 Source note"), createDragEvent("dragstart", dataTransfer));
    fireEvent(screen.getByLabelText("卡片 Cover note"), createDragEvent("drop", dataTransfer));

    await waitFor(() => expect(onGroupItems).toHaveBeenCalledWith(22, 21));
  });

  it("opens a bundle extraction dialog instead of expanding inline content", async () => {
    render(
      <MainCanvas
        box={{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }}
        items={[
          {
            id: 31,
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
        ]}
        bundleItemsByItem={{
          31: [
            {
              id: 32,
              boxId: 1,
              kind: "text",
              title: "Source note",
              content: "Source note",
              sourceUrl: "",
              sourcePath: "",
              bundleCount: 0,
              sortOrder: 0,
              createdAt: "2026-04-08T00:00:00.000Z",
              updatedAt: "2026-04-08T00:00:00.000Z",
              bundleParentId: 31,
            },
            {
              id: 33,
              boxId: 1,
              kind: "file",
              title: "brief.pdf",
              content: "C:\\docs\\brief.pdf",
              sourceUrl: "",
              sourcePath: "C:\\docs\\brief.pdf",
              bundleCount: 0,
              sortOrder: 1,
              createdAt: "2026-04-08T00:00:00.000Z",
              updatedAt: "2026-04-08T00:00:00.000Z",
              bundleParentId: 31,
            },
          ],
        }}
      />
    );

    expect(screen.getAllByText("Source note").length).toBeGreaterThan(0);
    expect(screen.getAllByText("PDF").length).toBeGreaterThan(0);
    expect(document.querySelector(".bundle-preview-grid")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "提取 Cover note 的内容" }));

    const dialog = await screen.findByRole("dialog", { name: "内容提取 Cover note" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("阅读视图")).toBeInTheDocument();
    expect(screen.getByText("导出文本")).toBeInTheDocument();
    expect(dialog).toHaveTextContent("Source note");
    expect(dialog).toHaveTextContent("brief.pdf");
    expect(document.querySelector(".bundle-preview")).toBeNull();
  });

  it("exports bundle content for AI as self-contained html", async () => {
    const onExportBundleAi = vi.fn().mockResolvedValue(undefined);

    render(
      <MainCanvas
        box={{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }}
        items={[
          {
            id: 81,
            boxId: 1,
            kind: "bundle",
            title: "",
            content: "",
            sourceUrl: "",
            sourcePath: "",
            bundleCount: 2,
            sortOrder: 0,
            createdAt: "2026-04-08T00:00:00.000Z",
            updatedAt: "2026-04-08T00:00:00.000Z",
          },
        ]}
        bundleItemsByItem={{
          81: [
            {
              id: 82,
              boxId: 1,
              kind: "text",
              title: "Source note",
              content: "第一段文本",
              sourceUrl: "",
              sourcePath: "",
              bundleCount: 0,
              sortOrder: 0,
              createdAt: "2026-04-08T00:00:00.000Z",
              updatedAt: "2026-04-08T00:00:00.000Z",
              bundleParentId: 81,
            },
            {
              id: 83,
              boxId: 1,
              kind: "image",
              title: "preview.png",
              content: "data:image/png;base64,ZmFrZQ==",
              sourceUrl: "",
              sourcePath: "",
              bundleCount: 0,
              sortOrder: 1,
              createdAt: "2026-04-08T00:00:00.000Z",
              updatedAt: "2026-04-08T00:00:00.000Z",
              bundleParentId: 81,
            },
          ],
        }}
        onExportBundleAi={onExportBundleAi}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "提取 组合 #81 的内容" }));
    fireEvent.click(await screen.findByRole("button", { name: "导出给AI" }));

    await waitFor(() => expect(onExportBundleAi).toHaveBeenCalledTimes(1));
    expect(onExportBundleAi).toHaveBeenCalledWith("组合 #81", expect.stringContaining("<html"));
    expect(onExportBundleAi).toHaveBeenCalledWith("组合 #81", expect.stringContaining("第一段文本"));
    expect(onExportBundleAi).toHaveBeenCalledWith(
      "组合 #81",
      expect.stringContaining("data:image/png;base64,ZmFrZQ==")
    );
  });

  it("renders collapsed bundle preview tiles without placeholder gaps and previews members on click", () => {
    const { container } = render(
      <MainCanvas
        box={{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }}
        items={[
          {
            id: 36,
            boxId: 1,
            kind: "bundle",
            title: "",
            content: "",
            sourceUrl: "",
            sourcePath: "",
            bundleCount: 2,
            sortOrder: 0,
            createdAt: "2026-04-08T00:00:00.000Z",
            updatedAt: "2026-04-08T00:00:00.000Z",
          },
        ]}
        bundleItemsByItem={{
          36: [
            {
              id: 37,
              boxId: 1,
              kind: "text",
              title: "Source note",
              content: "Source note body with more detail for preview",
              sourceUrl: "",
              sourcePath: "",
              bundleCount: 0,
              sortOrder: 0,
              createdAt: "2026-04-08T00:00:00.000Z",
              updatedAt: "2026-04-08T00:00:00.000Z",
              bundleParentId: 36,
            },
            {
              id: 38,
              boxId: 1,
              kind: "file",
              title: "brief.pdf",
              content: "C:\\docs\\brief.pdf",
              sourceUrl: "",
              sourcePath: "C:\\docs\\brief.pdf",
              bundleCount: 0,
              sortOrder: 1,
              createdAt: "2026-04-08T00:00:00.000Z",
              updatedAt: "2026-04-08T00:00:00.000Z",
              bundleParentId: 36,
            },
          ],
        }}
      />
    );

    expect(container.querySelector(".bundle-preview-grid")).not.toBeNull();
    expect(container.querySelectorAll(".bundle-preview-tile")).toHaveLength(2);
    expect(container.querySelector(".bundle-preview-tile.kind-text strong")).toBeNull();

    const previewTile = container.querySelector(".bundle-preview-tile.kind-text");
    expect(previewTile).not.toBeNull();
    if (previewTile) {
      fireEvent.click(previewTile);
    }

    expect(screen.getByRole("dialog", { name: "预览 Source note" })).toBeInTheDocument();
    expect(screen.getByText("Source note body with more detail for preview")).toBeInTheDocument();
    const closeButton = screen.getByRole("button", { name: "关闭预览" });
    expect(closeButton).toHaveTextContent(/^$/);
    expect(getComputedStyle(closeButton).marginRight).toBe("0");
  });

  it("opens the full image viewer directly from image bundle preview tiles", () => {
    const onPreviewImage = vi.fn();
    const { container } = render(
      <MainCanvas
        box={{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }}
        items={[
          {
            id: 39,
            boxId: 1,
            kind: "bundle",
            title: "",
            content: "",
            sourceUrl: "",
            sourcePath: "",
            bundleCount: 1,
            sortOrder: 0,
            createdAt: "2026-04-08T00:00:00.000Z",
            updatedAt: "2026-04-08T00:00:00.000Z",
          },
        ]}
        bundleItemsByItem={{
          39: [
            {
              id: 40,
              boxId: 1,
              kind: "image",
              title: "preview.png",
              content: "data:image/png;base64,ZmFrZQ==",
              sourceUrl: "",
              sourcePath: "",
              bundleCount: 0,
              sortOrder: 0,
              createdAt: "2026-04-08T00:00:00.000Z",
              updatedAt: "2026-04-08T00:00:00.000Z",
              bundleParentId: 39,
            },
          ],
        }}
        onPreviewImage={onPreviewImage}
      />
    );

    const imageTile = container.querySelector(".bundle-preview-tile.kind-image");
    expect(imageTile).not.toBeNull();
    if (imageTile) {
      fireEvent.click(imageTile);
    }

    expect(onPreviewImage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 40,
        kind: "image",
        title: "preview.png",
      })
    );
    expect(screen.queryByRole("dialog", { name: "预览 preview.png" })).not.toBeInTheDocument();
  });

  it("extracts bundle content for reading and export with type-specific actions", async () => {
    const onOpenExternal = vi.fn().mockResolvedValue(undefined);
    const onOpenPath = vi.fn().mockResolvedValue(undefined);
    const onPreviewImage = vi.fn();
    const onCopyText = vi.fn().mockResolvedValue(undefined);
    const onLoadBundleEntries = vi.fn().mockResolvedValue(undefined);

    render(
      <MainCanvas
        box={{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }}
        items={[
          {
            id: 61,
            boxId: 1,
            kind: "bundle",
            title: "First note line",
            content: "",
            sourceUrl: "",
            sourcePath: "",
            bundleCount: 4,
            sortOrder: 0,
            createdAt: "2026-04-08T00:00:00.000Z",
            updatedAt: "2026-04-08T00:00:00.000Z",
          },
        ]}
        bundleItemsByItem={{
          61: [
            {
              id: 62,
              boxId: 1,
              kind: "text",
              title: "First note line",
              content:
                "First note line. Second line. Third line. Fourth line keeps going so the expanded preview has real reading value.",
              sourceUrl: "",
              sourcePath: "",
              bundleCount: 0,
              sortOrder: 0,
              createdAt: "2026-04-08T00:00:00.000Z",
              updatedAt: "2026-04-08T00:00:00.000Z",
              bundleParentId: 61,
            },
            {
              id: 63,
              boxId: 1,
              kind: "link",
              title: "Hermes Agent",
              content: "https://example.com/hermes",
              sourceUrl: "https://example.com/hermes",
              sourcePath: "",
              bundleCount: 0,
              sortOrder: 1,
              createdAt: "2026-04-08T00:00:00.000Z",
              updatedAt: "2026-04-08T00:00:00.000Z",
              bundleParentId: 61,
            },
            {
              id: 64,
              boxId: 1,
              kind: "file",
              title: "brief.pdf",
              content: "C:\\docs\\brief.pdf",
              sourceUrl: "",
              sourcePath: "C:\\docs\\brief.pdf",
              bundleCount: 0,
              sortOrder: 2,
              createdAt: "2026-04-08T00:00:00.000Z",
              updatedAt: "2026-04-08T00:00:00.000Z",
              bundleParentId: 61,
            },
            {
              id: 65,
              boxId: 1,
              kind: "image",
              title: "preview.png",
              content: "data:image/png;base64,ZmFrZQ==",
              sourceUrl: "",
              sourcePath: "",
              bundleCount: 0,
              sortOrder: 3,
              createdAt: "2026-04-08T00:00:00.000Z",
              updatedAt: "2026-04-08T00:00:00.000Z",
              bundleParentId: 61,
            },
          ],
        }}
        onOpenExternal={onOpenExternal}
        onOpenPath={onOpenPath}
        onPreviewImage={onPreviewImage}
        onCopyText={onCopyText}
        onLoadBundleEntries={onLoadBundleEntries}
      />
    );

    expect(screen.queryByRole("button", { name: "编辑 First note line 的标题" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "提取 组合 #61 的内容" }));

    expect(await screen.findByRole("dialog", { name: "内容提取 组合 #61" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText(/Second line/).length).toBeGreaterThan(0));
    await waitFor(() =>
      expect(screen.getByDisplayValue(/链接： https:\/\/example\.com\/hermes/)).toBeInTheDocument()
    );
    expect(screen.getByDisplayValue(/路径： C:\\docs\\brief\.pdf/)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/图片： preview\.png/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "打开 https://example.com/hermes" }));
    expect(onOpenExternal).toHaveBeenCalledWith("https://example.com/hermes");

    fireEvent.click(screen.getByRole("button", { name: "打开 C:\\docs\\brief.pdf" }));
    expect(onOpenPath).toHaveBeenCalledWith("C:\\docs\\brief.pdf");

    fireEvent.click(screen.getByRole("button", { name: "放大查看 preview.png" }));
    expect(onPreviewImage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 65,
        kind: "image",
        title: "preview.png",
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "复制导出文本" }));
    await waitFor(() => expect(onCopyText).toHaveBeenCalledWith(expect.stringContaining("Hermes Agent")));
  });

  it("adds a top-level card into an existing bundle by dropping onto the bundle card", async () => {
    const onGroupItems = vi.fn().mockResolvedValue(undefined);

    render(
      <MainCanvas
        box={{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }}
        items={[
          {
            id: 41,
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
          {
            id: 42,
            boxId: 1,
            kind: "text",
            title: "Third note",
            content: "Third note",
            sourceUrl: "",
            sourcePath: "",
            bundleCount: 0,
            sortOrder: 1,
            createdAt: "2026-04-08T00:00:00.000Z",
            updatedAt: "2026-04-08T00:00:00.000Z",
          },
        ]}
        bundleItemsByItem={{
          41: [
            {
              id: 43,
              boxId: 1,
              kind: "text",
              title: "Source note",
              content: "Source note",
              sourceUrl: "",
              sourcePath: "",
              bundleCount: 0,
              sortOrder: 0,
              createdAt: "2026-04-08T00:00:00.000Z",
              updatedAt: "2026-04-08T00:00:00.000Z",
              bundleParentId: 41,
            },
          ],
        }}
        onGroupItems={onGroupItems}
      />
    );

    const dataTransfer = createDataTransfer();
    fireEvent(screen.getByLabelText("卡片 Third note"), createDragEvent("dragstart", dataTransfer));
    fireEvent(screen.getByLabelText("卡片 Cover note"), createDragEvent("drop", dataTransfer));

    await waitFor(() => expect(onGroupItems).toHaveBeenCalledWith(42, 41));
  });

  it("groups cards even when the drop event cannot read the dragged payload", async () => {
    const onGroupItems = vi.fn().mockResolvedValue(undefined);

    render(
      <MainCanvas
        box={{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }}
        items={[
          {
            id: 91,
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
            id: 92,
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
        ]}
        onGroupItems={onGroupItems}
      />
    );

    const dragData = createDataTransfer();
    fireEvent(screen.getByLabelText("卡片 Source note"), createDragEvent("dragstart", dragData));

    const protectedDropDataTransfer = {
      dropEffect: "move",
      effectAllowed: "move",
      files: [] as Array<{ path: string }>,
      types: ["application/x-brain-item-id"],
      getData() {
        return "";
      },
      setData(): void {
        return undefined;
      },
    };

    fireEvent(screen.getByLabelText("卡片 Cover note"), createDragEvent("dragover", protectedDropDataTransfer));
    fireEvent(screen.getByLabelText("卡片 Cover note"), createDragEvent("drop", protectedDropDataTransfer));

    await waitFor(() => expect(onGroupItems).toHaveBeenCalledWith(92, 91));
  });

  it("moves a collapsed bundle preview tile into another bundle by dropping it on the target bundle card", async () => {
    const onGroupItems = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <MainCanvas
        box={{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }}
        items={[
          {
            id: 71,
            boxId: 1,
            kind: "bundle",
            title: "",
            content: "",
            sourceUrl: "",
            sourcePath: "",
            bundleCount: 2,
            sortOrder: 0,
            createdAt: "2026-04-08T00:00:00.000Z",
            updatedAt: "2026-04-08T00:00:00.000Z",
          },
          {
            id: 72,
            boxId: 1,
            kind: "bundle",
            title: "",
            content: "",
            sourceUrl: "",
            sourcePath: "",
            bundleCount: 2,
            sortOrder: 1,
            createdAt: "2026-04-08T00:00:00.000Z",
            updatedAt: "2026-04-08T00:00:00.000Z",
          },
        ]}
        bundleItemsByItem={{
          71: [
            {
              id: 73,
              boxId: 1,
              kind: "text",
              title: "Member A",
              content: "Member A",
              sourceUrl: "",
              sourcePath: "",
              bundleCount: 0,
              sortOrder: 1,
              createdAt: "2026-04-08T00:00:00.000Z",
              updatedAt: "2026-04-08T00:00:00.000Z",
              bundleParentId: 71,
            },
          ],
          72: [
            {
              id: 74,
              boxId: 1,
              kind: "text",
              title: "Member B",
              content: "Member B",
              sourceUrl: "",
              sourcePath: "",
              bundleCount: 0,
              sortOrder: 1,
              createdAt: "2026-04-08T00:00:00.000Z",
              updatedAt: "2026-04-08T00:00:00.000Z",
              bundleParentId: 72,
            },
          ],
        }}
        onGroupItems={onGroupItems}
      />
    );
    const dataTransfer = createDataTransfer();
    const previewTile = container.querySelector(".bundle-preview-tile.kind-text");
    expect(previewTile).not.toBeNull();
    if (previewTile) {
      fireEvent(previewTile, createDragEvent("dragstart", dataTransfer));
    }
    fireEvent(screen.getByLabelText("卡片 组合 #72"), createDragEvent("drop", dataTransfer));

    await waitFor(() => expect(onGroupItems).toHaveBeenCalledWith(73, 72));
  });

  it("moves a collapsed bundle preview tile into the top-level flow without expanding", async () => {
    const onMoveItemToIndex = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <MainCanvas
        box={{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }}
        items={[
          {
            id: 81,
            boxId: 1,
            kind: "bundle",
            title: "",
            content: "",
            sourceUrl: "",
            sourcePath: "",
            bundleCount: 1,
            sortOrder: 0,
            createdAt: "2026-04-08T00:00:00.000Z",
            updatedAt: "2026-04-08T00:00:00.000Z",
          },
          {
            id: 82,
            boxId: 1,
            kind: "file",
            title: "openclaw应用.rtf",
            content: "",
            sourceUrl: "",
            sourcePath: "C:\\docs\\openclaw应用.rtf",
            bundleCount: 0,
            sortOrder: 1,
            createdAt: "2026-04-08T00:00:00.000Z",
            updatedAt: "2026-04-08T00:00:00.000Z",
          },
        ]}
        bundleItemsByItem={{
          81: [
            {
              id: 83,
              boxId: 1,
              kind: "image",
              title: "preview.png",
              content: "data:image/png;base64,ZmFrZQ==",
              sourceUrl: "",
              sourcePath: "",
              bundleCount: 0,
              sortOrder: 0,
              createdAt: "2026-04-08T00:00:00.000Z",
              updatedAt: "2026-04-08T00:00:00.000Z",
              bundleParentId: 81,
            },
          ],
        }}
        onMoveItemToIndex={onMoveItemToIndex}
      />
    );

    const dataTransfer = createDataTransfer();
    const imageTile = container.querySelector(".bundle-preview-tile.kind-image");
    expect(imageTile).not.toBeNull();
    if (imageTile) {
      fireEvent(imageTile, createDragEvent("dragstart", dataTransfer));
    }
    fireEvent(screen.getByLabelText("放到位置 2"), createDragEvent("drop", dataTransfer));

    await waitFor(() => expect(onMoveItemToIndex).toHaveBeenCalledWith(83, 1));
  });

  it("moves a collapsed bundle preview tile out of the bundle when dropped on a top-level card", async () => {
    const onMoveItemToIndex = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <MainCanvas
        box={{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }}
        items={[
          {
            id: 91,
            boxId: 1,
            kind: "bundle",
            title: "",
            content: "",
            sourceUrl: "",
            sourcePath: "",
            bundleCount: 1,
            sortOrder: 0,
            createdAt: "2026-04-08T00:00:00.000Z",
            updatedAt: "2026-04-08T00:00:00.000Z",
          },
          {
            id: 92,
            boxId: 1,
            kind: "file",
            title: "openclaw应用.rtf",
            content: "",
            sourceUrl: "",
            sourcePath: "C:\\docs\\openclaw应用.rtf",
            bundleCount: 0,
            sortOrder: 1,
            createdAt: "2026-04-08T00:00:00.000Z",
            updatedAt: "2026-04-08T00:00:00.000Z",
          },
        ]}
        bundleItemsByItem={{
          91: [
            {
              id: 93,
              boxId: 1,
              kind: "image",
              title: "preview.png",
              content: "data:image/png;base64,ZmFrZQ==",
              sourceUrl: "",
              sourcePath: "",
              bundleCount: 0,
              sortOrder: 0,
              createdAt: "2026-04-08T00:00:00.000Z",
              updatedAt: "2026-04-08T00:00:00.000Z",
              bundleParentId: 91,
            },
          ],
        }}
        onMoveItemToIndex={onMoveItemToIndex}
      />
    );

    const dataTransfer = createDataTransfer();
    const imageTile = container.querySelector(".bundle-preview-tile.kind-image");
    expect(imageTile).not.toBeNull();
    if (imageTile) {
      fireEvent(imageTile, createDragEvent("dragstart", dataTransfer));
    }

    fireEvent.dragOver(screen.getByLabelText("卡片 openclaw应用.rtf"), { dataTransfer });
    fireEvent.drop(screen.getByLabelText("卡片 openclaw应用.rtf"), { dataTransfer });

    await waitFor(() => expect(onMoveItemToIndex).toHaveBeenCalledWith(93, 1));
  });

  it("moves a collapsed bundle preview tile into the whitespace below a stack card", async () => {
    const onMoveItemToIndex = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <MainCanvas
        box={{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }}
        items={[
          {
            id: 111,
            boxId: 1,
            kind: "bundle",
            title: "",
            content: "",
            sourceUrl: "",
            sourcePath: "",
            bundleCount: 1,
            sortOrder: 0,
            createdAt: "2026-04-08T00:00:00.000Z",
            updatedAt: "2026-04-08T00:00:00.000Z",
          },
          {
            id: 112,
            boxId: 1,
            kind: "file",
            title: "openclaw应用.rtf",
            content: "",
            sourceUrl: "",
            sourcePath: "C:\\docs\\openclaw应用.rtf",
            bundleCount: 0,
            sortOrder: 1,
            createdAt: "2026-04-08T00:00:00.000Z",
            updatedAt: "2026-04-08T00:00:00.000Z",
          },
        ]}
        bundleItemsByItem={{
          111: [
            {
              id: 113,
              boxId: 1,
              kind: "image",
              title: "preview.png",
              content: "data:image/png;base64,ZmFrZQ==",
              sourceUrl: "",
              sourcePath: "",
              bundleCount: 0,
              sortOrder: 0,
              createdAt: "2026-04-08T00:00:00.000Z",
              updatedAt: "2026-04-08T00:00:00.000Z",
              bundleParentId: 111,
            },
          ],
        }}
        onMoveItemToIndex={onMoveItemToIndex}
      />
    );

    const dataTransfer = createDataTransfer();
    const imageTile = container.querySelector(".bundle-preview-tile.kind-image");
    expect(imageTile).not.toBeNull();
    if (imageTile) {
      fireEvent(imageTile, createDragEvent("dragstart", dataTransfer));
    }

    const stacks = container.querySelectorAll(".card-stack");
    expect(stacks.length).toBeGreaterThan(1);
    const targetWhitespaceStack = stacks[1] as HTMLElement | undefined;
    expect(targetWhitespaceStack).toBeDefined();
    if (!targetWhitespaceStack) {
      return;
    }

    fireEvent(targetWhitespaceStack, createDragEvent("dragover", dataTransfer));
    fireEvent(targetWhitespaceStack, createDragEvent("drop", dataTransfer));

    await waitFor(() => expect(onMoveItemToIndex).toHaveBeenCalledWith(113, 2));
  });

  it("moves a collapsed bundle preview tile when dropped on the card-grid background hole", async () => {
    const onMoveItemToIndex = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <MainCanvas
        box={{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }}
        items={[
          {
            id: 131,
            boxId: 1,
            kind: "bundle",
            title: "",
            content: "",
            sourceUrl: "",
            sourcePath: "",
            bundleCount: 1,
            sortOrder: 0,
            createdAt: "2026-04-08T00:00:00.000Z",
            updatedAt: "2026-04-08T00:00:00.000Z",
          },
          {
            id: 132,
            boxId: 1,
            kind: "file",
            title: "openclaw应用.rtf",
            content: "",
            sourceUrl: "",
            sourcePath: "C:\\docs\\openclaw应用.rtf",
            bundleCount: 0,
            sortOrder: 1,
            createdAt: "2026-04-08T00:00:00.000Z",
            updatedAt: "2026-04-08T00:00:00.000Z",
          },
        ]}
        bundleItemsByItem={{
          131: [
            {
              id: 133,
              boxId: 1,
              kind: "image",
              title: "preview.png",
              content: "data:image/png;base64,ZmFrZQ==",
              sourceUrl: "",
              sourcePath: "",
              bundleCount: 0,
              sortOrder: 0,
              createdAt: "2026-04-08T00:00:00.000Z",
              updatedAt: "2026-04-08T00:00:00.000Z",
              bundleParentId: 131,
            },
          ],
        }}
        onMoveItemToIndex={onMoveItemToIndex}
      />
    );

    const dataTransfer = createDataTransfer();
    const imageTile = container.querySelector(".bundle-preview-tile.kind-image");
    expect(imageTile).not.toBeNull();
    if (imageTile) {
      fireEvent(imageTile, createDragEvent("dragstart", dataTransfer));
    }

    const cardGrid = screen.getByLabelText("当前盒子内容");
    fireEvent(cardGrid, createDragEvent("dragover", dataTransfer));
    fireEvent(cardGrid, createDragEvent("drop", dataTransfer));

    await waitFor(() => expect(onMoveItemToIndex).toHaveBeenCalledWith(133, 2));
  });

  it("disables native dragging on collapsed bundle preview images", () => {
    const { container } = render(
      <MainCanvas
        box={{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }}
        items={[
          {
            id: 121,
            boxId: 1,
            kind: "bundle",
            title: "",
            content: "",
            sourceUrl: "",
            sourcePath: "",
            bundleCount: 1,
            sortOrder: 0,
            createdAt: "2026-04-08T00:00:00.000Z",
            updatedAt: "2026-04-08T00:00:00.000Z",
          },
        ]}
        bundleItemsByItem={{
          121: [
            {
              id: 122,
              boxId: 1,
              kind: "image",
              title: "preview.png",
              content: "data:image/png;base64,ZmFrZQ==",
              sourceUrl: "",
              sourcePath: "",
              bundleCount: 0,
              sortOrder: 0,
              createdAt: "2026-04-08T00:00:00.000Z",
              updatedAt: "2026-04-08T00:00:00.000Z",
              bundleParentId: 121,
            },
          ],
        }}
      />
    );

    const previewImage = container.querySelector(".bundle-preview-image");
    expect(previewImage).not.toBeNull();
    expect(previewImage).toHaveAttribute("draggable", "false");
  });

  it("shrinks portrait image cards into a compact layout after the image ratio loads", async () => {
    const { container } = render(
      <MainCanvas
        box={{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }}
        items={[
          {
            id: 101,
            boxId: 1,
            kind: "image",
            title: "tall-shot.png",
            content: "data:image/png;base64,ZmFrZQ==",
            sourceUrl: "",
            sourcePath: "",
            bundleCount: 0,
            sortOrder: 0,
            createdAt: "2026-04-08T00:00:00.000Z",
            updatedAt: "2026-04-08T00:00:00.000Z",
          },
        ]}
      />
    );

    const imagePreview = container.querySelector(".work-card.kind-image .card-image-preview");
    expect(imagePreview).not.toBeNull();
    if (!imagePreview) {
      return;
    }

    mockImageSize(imagePreview, 720, 1600);
    fireEvent.load(imagePreview);

    await waitFor(() => {
      expect(container.querySelector(".work-card.kind-image")).toHaveClass("work-card-compact");
      expect(container.querySelector(".card-stack")).toHaveClass("card-stack-compact");
    });
  });
});

