import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppShell } from "./app-shell";

describe("AppShell", () => {
  it("renders the box rail, current box canvas, and quick panel", () => {
    render(
      <AppShell
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
    expect(screen.getByText("Quick Panel")).toBeInTheDocument();
  });
});
