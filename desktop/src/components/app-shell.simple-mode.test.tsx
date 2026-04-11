import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";

afterEach(() => {
  cleanup();
});

describe("AppShell simple mode", () => {
  it("renders only a compact centered box grid in simple mode", () => {
    const { container } = render(
      <AppShell
        onQuickCapture={async () => undefined}
        snapshot={{
          boxes: [
            { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
            { id: 2, name: "123", color: "#2563eb", description: "", sortOrder: 1 },
          ],
          items: [
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
          ],
          panelState: { selectedBoxId: 1, quickPanelOpen: true, simpleMode: true },
        }}
      />
    );

    expect(screen.getByLabelText("盒子")).toBeInTheDocument();
    expect(screen.queryByText("新盒子名称")).not.toBeInTheDocument();
    expect(screen.queryByText("暂无描述")).not.toBeInTheDocument();
    expect(container.querySelector(".app-shell")).toHaveClass("simple-mode");
    expect(container.querySelector(".box-list")).toHaveClass("simple-grid");
    expect(container.querySelector(".app-shell.simple-mode .box-swatch")).toBeNull();
    expect(container.querySelector(".box-pill-primary")).toBeNull();
    expect(container.querySelector(".workspace-column")).toBeNull();
    expect(container.querySelector(".quick-panel")).toBeNull();
  });

  it("renders a bottom action that exits simple mode", () => {
    const onExitSimpleMode = vi.fn();

    render(
      <AppShell
        onQuickCapture={async () => undefined}
        onExitSimpleMode={onExitSimpleMode}
        snapshot={{
          boxes: [
            { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
            { id: 2, name: "123", color: "#2563eb", description: "", sortOrder: 1 },
          ],
          items: [],
          panelState: { selectedBoxId: 1, quickPanelOpen: true, simpleMode: true },
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "回到主界面" }));

    expect(onExitSimpleMode).toHaveBeenCalledTimes(1);
  });

  it("renders a bottom action that toggles always-on-top in simple mode", () => {
    const onToggleAlwaysOnTop = vi.fn();

    render(
      <AppShell
        onQuickCapture={async () => undefined}
        onToggleAlwaysOnTop={onToggleAlwaysOnTop}
        snapshot={{
          boxes: [
            { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
            { id: 2, name: "123", color: "#2563eb", description: "", sortOrder: 1 },
          ],
          items: [],
          panelState: { selectedBoxId: 1, quickPanelOpen: true, simpleMode: true, alwaysOnTop: false },
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "切换窗口置顶" }));

    expect(onToggleAlwaysOnTop).toHaveBeenCalledTimes(1);
    expect(onToggleAlwaysOnTop).toHaveBeenCalledWith(true);
  });
});
