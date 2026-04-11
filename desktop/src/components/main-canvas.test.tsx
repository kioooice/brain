import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MainCanvas } from "./main-canvas";

afterEach(() => {
  cleanup();
});

describe("MainCanvas", () => {
  it("renders cards in tile layout", () => {
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

    expect(container.querySelector(".card-grid")).toHaveAttribute("data-layout", "tiles");
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

    fireEvent.click(screen.getByRole("button", { name: "编辑 Alpha 的标题" }));
    fireEvent.change(screen.getByLabelText("编辑 Alpha 的标题"), {
      target: { value: "Renamed Alpha" },
    });
    const renameItemForm = screen.getByLabelText("编辑 Alpha 的标题").closest("form");
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
    expect(screen.queryByRole("button", { name: `编辑 ${repeated} 的标题` })).not.toBeInTheDocument();
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
    expect(screen.queryByRole("button", { name: "编辑 Plain note 的标题" })).not.toBeInTheDocument();
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
});
