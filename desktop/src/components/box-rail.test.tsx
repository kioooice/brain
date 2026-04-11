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
        onSelectBox={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "打开主界面" })).toBeInTheDocument();
    expect(screen.queryByTestId("rail-box-list")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "选择盒子 Inbox" })).not.toBeInTheDocument();
  });

  it("still renders box pills in simple mode", () => {
    render(
      <BoxRail
        boxes={[
          { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
          { id: 2, name: "Ideas", color: "#2563eb", description: "", sortOrder: 1 },
        ]}
        items={[]}
        selectedBoxId={1}
        simpleMode
        onSelectBox={vi.fn()}
      />
    );

    expect(screen.getByTestId("rail-box-list")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "选择盒子 Inbox" })).toBeInTheDocument();
  });

  it("accepts external text drags based on dataTransfer types before drop", () => {
    render(
      <BoxRail
        boxes={[
          { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
          { id: 2, name: "Ideas", color: "#2563eb", description: "", sortOrder: 1 },
        ]}
        items={[]}
        selectedBoxId={1}
        simpleMode
        onSelectBox={vi.fn()}
      />
    );

    const box = screen.getByRole("button", { name: "选择盒子 Ideas" });
    const event = createEvent.dragOver(box);

    Object.defineProperty(event, "dataTransfer", {
      value: {
        files: [],
        types: ["text/plain"],
        getData: () => "",
      },
    });

    fireEvent(box, event);

    expect(event.defaultPrevented).toBe(true);
    expect(box).toHaveAttribute("data-drop-target", "true");
  });

  it("captures dropped image files into the target box", async () => {
    class MockFileReader {
      result: string | ArrayBuffer | null = null;
      onload: null | (() => void) = null;

      readAsDataURL() {
        this.result = "data:image/png;base64,ZmFrZQ==";
        this.onload?.();
      }
    }

    vi.stubGlobal("FileReader", MockFileReader);
    const onDropImageToBox = vi.fn();

    render(
      <BoxRail
        boxes={[
          { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
          { id: 2, name: "Ideas", color: "#2563eb", description: "", sortOrder: 1 },
        ]}
        items={[]}
        selectedBoxId={1}
        simpleMode
        onSelectBox={vi.fn()}
        onDropImageToBox={onDropImageToBox}
      />
    );

    const box = screen.getByRole("button", { name: "选择盒子 Ideas" });
    const imageFile = new File(["fake"], "dragged.png", { type: "image/png" });
    const event = createEvent.drop(box);

    Object.defineProperty(event, "dataTransfer", {
      value: {
        files: [imageFile],
        items: [
          {
            kind: "file",
            type: "image/png",
            getAsFile: () => imageFile,
          },
        ],
        types: ["Files"],
        getData: () => "",
      },
    });

    fireEvent(box, event);

    await waitFor(() =>
      expect(onDropImageToBox).toHaveBeenCalledWith(2, "data:image/png;base64,ZmFrZQ==", "dragged.png")
    );
  });
});
