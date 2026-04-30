import { cleanup, createEvent, fireEvent, render, screen } from "@testing-library/react";
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

    const trash = screen.getByTestId("quick-panel-trash");
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
});
