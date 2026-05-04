import { cleanup, createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoxRail } from "./box-rail";

afterEach(() => {
  cleanup();
});

describe("BoxRail", () => {
  it("keeps the standard rail focused on app navigation without box pills", () => {
    render(
      <BoxRail
        boxes={[
          { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
          { id: 2, name: "Ideas", color: "#2563eb", description: "", sortOrder: 1 },
        ]}
        items={[]}
        selectedBoxId={1}
        activePanel="workspace"
        onSelectPanel={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "打开主界面" })).toBeInTheDocument();
    expect(screen.queryByTestId("rail-box-list")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "选择盒子 Inbox" })).not.toBeInTheDocument();
  });

  it("keeps the trash zone usable for item deletion", () => {
    const onDeleteItem = vi.fn();
    render(
      <BoxRail
        boxes={[
          { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
          { id: 2, name: "Ideas", color: "#2563eb", description: "", sortOrder: 1 },
        ]}
        items={[]}
        selectedBoxId={1}
        activePanel="workspace"
        onDeleteItem={onDeleteItem}
        onSelectPanel={vi.fn()}
      />
    );

    const trash = screen.getByTestId("rail-trash");
    const event = createEvent.drop(trash);

    Object.defineProperty(event, "dataTransfer", {
      value: {
        files: [],
        types: ["application/x-brain-item-id"],
        getData: (type: string) => (type === "application/x-brain-item-id" ? "42" : ""),
      },
    });

    fireEvent(trash, event);

    expect(event.defaultPrevented).toBe(true);
    expect(onDeleteItem).toHaveBeenCalledWith(42);
  });

  it("shows a specific trash hint while dragging a card over it", () => {
    render(
      <BoxRail
        boxes={[
          { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
          { id: 2, name: "Ideas", color: "#2563eb", description: "", sortOrder: 1 },
        ]}
        items={[]}
        selectedBoxId={1}
        activePanel="workspace"
      />
    );

    const trash = screen.getByTestId("rail-trash");
    const event = createEvent.dragOver(trash);

    Object.defineProperty(event, "dataTransfer", {
      value: {
        files: [],
        types: ["application/x-brain-item-id"],
        getData: (type: string) => (type === "application/x-brain-item-id" ? "42" : ""),
      },
    });

    fireEvent(trash, event);

    expect(trash).toHaveAttribute("data-drop-kind", "item");
    expect(trash).toHaveAttribute("data-drop-visual", "delete");
    expect(trash).not.toHaveClass("active");
    expect(screen.getByText("松开删除卡片")).toBeInTheDocument();
  });

  it("shows temporary box move targets while dragging a card over the rail", () => {
    const onMoveItemToBox = vi.fn().mockResolvedValue(undefined);
    render(
      <BoxRail
        boxes={[
          { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
          { id: 2, name: "Ideas", color: "#2563eb", description: "", sortOrder: 1 },
        ]}
        items={[
          {
            id: 42,
            boxId: 1,
            kind: "text",
            title: "Draft note",
            content: "Draft note",
            sourceUrl: "",
            sourcePath: "",
            bundleCount: 0,
            sortOrder: 0,
            createdAt: "2026-04-08T00:00:00.000Z",
            updatedAt: "2026-04-08T00:00:00.000Z",
          },
        ]}
        selectedBoxId={1}
        activePanel="workspace"
        onMoveItemToBox={onMoveItemToBox}
      />
    );

    const rail = screen.getByLabelText("盒子");
    const railDragEnter = createEvent.dragEnter(rail);
    Object.defineProperty(railDragEnter, "dataTransfer", {
      value: {
        files: [],
        types: ["application/x-brain-item-id"],
        getData: (type: string) => (type === "application/x-brain-item-id" ? "42" : ""),
      },
    });

    fireEvent(rail, railDragEnter);

    expect(screen.getByRole("region", { name: "移动到盒子" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "移动到盒子 Inbox" })).not.toBeInTheDocument();

    const target = screen.getByRole("button", { name: "移动到盒子 Ideas" });
    const targetDragOver = createEvent.dragOver(target);
    Object.defineProperty(targetDragOver, "dataTransfer", {
      value: {
        files: [],
        types: ["application/x-brain-item-id"],
        getData: (type: string) => (type === "application/x-brain-item-id" ? "42" : ""),
      },
    });

    fireEvent(target, targetDragOver);

    expect(target).toHaveAttribute("data-drop-visual", "move");
    expect(target).not.toHaveAttribute("data-drop-target");
    expect(screen.getByText("松开移动到这里")).toBeInTheDocument();

    const targetDrop = createEvent.drop(target);
    Object.defineProperty(targetDrop, "dataTransfer", {
      value: {
        files: [],
        types: ["application/x-brain-item-id"],
        getData: (type: string) => (type === "application/x-brain-item-id" ? "42" : ""),
      },
    });

    fireEvent(target, targetDrop);

    expect(targetDrop.defaultPrevented).toBe(true);
    expect(onMoveItemToBox).toHaveBeenCalledWith(42, 2);
  });

  it("keeps the move targets open with a rollback hint when moving a card fails", async () => {
    const onMoveItemToBox = vi.fn().mockRejectedValue(new Error("move failed"));
    render(
      <BoxRail
        boxes={[
          { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
          { id: 2, name: "Ideas", color: "#2563eb", description: "", sortOrder: 1 },
        ]}
        items={[
          {
            id: 42,
            boxId: 1,
            kind: "text",
            title: "Draft note",
            content: "Draft note",
            sourceUrl: "",
            sourcePath: "",
            bundleCount: 0,
            sortOrder: 0,
            createdAt: "2026-04-08T00:00:00.000Z",
            updatedAt: "2026-04-08T00:00:00.000Z",
          },
        ]}
        selectedBoxId={1}
        activePanel="workspace"
        onMoveItemToBox={onMoveItemToBox}
      />
    );

    const rail = screen.getByLabelText("盒子");
    const railDragEnter = createEvent.dragEnter(rail);
    Object.defineProperty(railDragEnter, "dataTransfer", {
      value: {
        files: [],
        types: ["application/x-brain-item-id"],
        getData: (type: string) => (type === "application/x-brain-item-id" ? "42" : ""),
      },
    });
    fireEvent(rail, railDragEnter);

    const target = screen.getByRole("button", { name: "移动到盒子 Ideas" });
    const targetDrop = createEvent.drop(target);
    Object.defineProperty(targetDrop, "dataTransfer", {
      value: {
        files: [],
        types: ["application/x-brain-item-id"],
        getData: (type: string) => (type === "application/x-brain-item-id" ? "42" : ""),
      },
    });

    fireEvent(target, targetDrop);

    await waitFor(() => expect(screen.getByText("移动失败，卡片仍在原盒子")).toBeInTheDocument());
    expect(screen.getByRole("region", { name: "移动到盒子" })).toBeInTheDocument();
    expect(target).toHaveAttribute("data-drop-state", "error");
    expect(target).toHaveAttribute("data-drop-visual", "error");
  });
});
