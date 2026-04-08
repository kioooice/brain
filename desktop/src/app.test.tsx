import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./app";

beforeEach(() => {
  window.brainDesktop = {
    bootstrap: vi.fn().mockResolvedValue({
      boxes: [{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }],
      items: [],
      panelState: { selectedBoxId: 1, quickPanelOpen: true },
    }),
  };
});

describe("App", () => {
  it("shows the desktop loading shell before bootstrap resolves", () => {
    render(<App />);

    expect(screen.getByText("Loading Brain Desktop...")).toBeInTheDocument();
  });

  it("loads the first box name from preload bootstrap", async () => {
    render(<App />);

    expect(await screen.findAllByText("Inbox")).toHaveLength(2);
  });
});
