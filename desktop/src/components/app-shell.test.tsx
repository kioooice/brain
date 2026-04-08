import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";

afterEach(() => {
  cleanup();
});

describe("AppShell", () => {
  it("renders the box rail, current box canvas, and quick panel", () => {
    render(
      <AppShell
        onQuickCapture={async () => undefined}
        snapshot={{
          boxes: [
            { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
            { id: 2, name: "Brand", color: "#2563eb", description: "", sortOrder: 1 },
          ],
          items: [{ id: 11, boxId: 2, kind: "image", title: "Hero ref", content: "" }],
          panelState: { selectedBoxId: 2, quickPanelOpen: true },
        }}
      />
    );

    expect(screen.getByText("Boxes")).toBeInTheDocument();
    expect(screen.getByText("Inbox")).toBeInTheDocument();
    expect(screen.getAllByText("Brand")).toHaveLength(2);
    expect(screen.getByText("Current Box")).toBeInTheDocument();
    expect(screen.getByText("1 item")).toBeInTheDocument();
    expect(screen.getAllByText("Hero ref")).toHaveLength(2);
    expect(screen.getByText("Quick Capture")).toBeInTheDocument();
    expect(screen.getByText("New text and links will go into Brand")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Paste a link or note")).toBeInTheDocument();
    expect(screen.getByText("Quick Panel")).toBeInTheDocument();
  });

  it("passes submissions through to the capture callback", async () => {
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

    fireEvent.change(screen.getByPlaceholderText("Paste a link or note"), {
      target: { value: "Quick note" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onQuickCapture).toHaveBeenCalledWith("Quick note");
  });
});
