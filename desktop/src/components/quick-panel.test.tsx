import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuickPanel } from "./quick-panel";

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

describe("QuickPanel", () => {
  it("activates the trash zone during dragover when only drag types are available", () => {
    render(
      <QuickPanel
        open
        boxes={[
          { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
          { id: 2, name: "Brand", color: "#2563eb", description: "", sortOrder: 1 },
        ]}
        items={[]}
      />
    );

    const event = new Event("dragover", { bubbles: true, cancelable: true }) as Event & {
      dataTransfer?: {
        files: Array<{ path: string }>;
        types: string[];
        getData(type: string): string;
      };
    };
    Object.defineProperty(event, "dataTransfer", {
      value: {
        files: [],
        types: ["application/x-brain-item-id"],
        getData: () => "",
      },
    });

    const trash = screen.getByTestId("quick-panel-trash");
    fireEvent(trash, event);

    expect(trash).toHaveAttribute("data-drop-kind", "item");
  });

  it("deletes cards and boxes by dropping them into the trash", () => {
    const onDeleteItem = vi.fn().mockResolvedValue(undefined);
    const onDeleteBox = vi.fn().mockResolvedValue(undefined);

    render(
      <QuickPanel
        open
        boxes={[
          { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
          { id: 2, name: "Brand", color: "#2563eb", description: "", sortOrder: 1 },
        ]}
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
        ]}
        onDeleteItem={onDeleteItem}
        onDeleteBox={onDeleteBox}
      />
    );

    const dragItemData = createDataTransfer();
    dragItemData.setData("application/x-brain-item-id", "31");
    fireEvent(screen.getByTestId("quick-panel-trash"), createDragEvent("drop", dragItemData));

    const dragBoxData = createDataTransfer();
    dragBoxData.setData("application/x-brain-box-id", "2");
    fireEvent(screen.getByTestId("quick-panel-trash"), createDragEvent("drop", dragBoxData));

    expect(onDeleteItem).toHaveBeenCalledWith(31);
    expect(onDeleteBox).toHaveBeenCalledWith(2);
  });

  it("starts dragging a recent item with the same item mime payload", () => {
    render(
      <QuickPanel
        open
        boxes={[{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }]}
        items={[
          {
            id: 41,
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
        ]}
      />
    );

    const dragData = createDataTransfer();
    fireEvent(screen.getByLabelText("最近卡片 image.png"), createDragEvent("dragstart", dragData));

    expect(dragData.getData("application/x-brain-item-id")).toBe("41");
  });

  it("hides the trash zone in simple mode", () => {
    render(
      <QuickPanel
        open
        simpleMode
        boxes={[{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }]}
        items={[
          {
            id: 41,
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
        ]}
      />
    );

    expect(screen.queryByTestId("quick-panel-trash")).not.toBeInTheDocument();
  });
});
