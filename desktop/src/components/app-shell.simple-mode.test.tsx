import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";

afterEach(() => {
  cleanup();
});

describe("AppShell simple mode", () => {
  it("renders only the floating ball when simple mode opens in ball view", () => {
    const { container } = render(
      <AppShell
        onQuickCapture={async () => undefined}
        snapshot={{
          boxes: [
            { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
            { id: 2, name: "123", color: "#2563eb", description: "", sortOrder: 1 },
          ],
          items: [],
          panelState: { selectedBoxId: 1, quickPanelOpen: true, simpleMode: true, simpleModeView: "ball" },
        }}
      />
    );

    expect(screen.getByTestId("simple-mode-floating-ball")).toBeInTheDocument();
    expect(screen.getByText("Brain")).toBeInTheDocument();
    expect(container.querySelector(".simple-mode-floating-ball-beacon")).toBeNull();
    expect(container.querySelector(".simple-mode-floating-ball-core")).toBeInTheDocument();
    expect(container.querySelector(".box-list")).toBeNull();
    expect(container.querySelector(".workspace-column")).toBeNull();
    expect(container.querySelector(".quick-panel")).toBeNull();
  });

  it("renders only a compact centered box grid in simple panel view", () => {
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
          panelState: { selectedBoxId: 1, quickPanelOpen: true, simpleMode: true, simpleModeView: "panel" },
        }}
      />
    );

    expect(screen.getByLabelText("盒子")).toBeInTheDocument();
    expect(screen.queryByTestId("simple-mode-floating-ball")).not.toBeInTheDocument();
    expect(container.querySelector(".app-shell")).toHaveClass("simple-mode");
    expect(container.querySelector(".box-list")).toHaveClass("simple-grid");
    expect(container.querySelector(".app-shell.simple-mode .box-swatch")).toBeNull();
    expect(container.querySelector(".box-pill-primary")).toBeNull();
    expect(container.querySelector(".workspace-column")).toBeNull();
    expect(container.querySelector(".quick-panel")).toBeNull();
  });

  it("expands from the floating ball into the simple panel", () => {
    const onSetSimpleModeView = vi.fn();

    render(
      <AppShell
        onQuickCapture={async () => undefined}
        onSetSimpleModeView={onSetSimpleModeView}
        snapshot={{
          boxes: [
            { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
            { id: 2, name: "123", color: "#2563eb", description: "", sortOrder: 1 },
          ],
          items: [],
          panelState: { selectedBoxId: 1, quickPanelOpen: true, simpleMode: true, simpleModeView: "ball" },
        }}
      />
    );

    fireEvent.click(screen.getByTestId("simple-mode-floating-ball"));

    expect(onSetSimpleModeView).toHaveBeenCalledTimes(1);
    expect(onSetSimpleModeView).toHaveBeenCalledWith("panel");
  });

  it("drags the floating ball without expanding the panel", () => {
    const onSetSimpleModeView = vi.fn();
    const onMoveFloatingBall = vi.fn();

    render(
      <AppShell
        onQuickCapture={async () => undefined}
        onSetSimpleModeView={onSetSimpleModeView}
        onMoveFloatingBall={onMoveFloatingBall}
        snapshot={{
          boxes: [
            { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
            { id: 2, name: "123", color: "#2563eb", description: "", sortOrder: 1 },
          ],
          items: [],
          panelState: { selectedBoxId: 1, quickPanelOpen: true, simpleMode: true, simpleModeView: "ball" },
        }}
      />
    );

    const ball = screen.getByTestId("simple-mode-floating-ball");

    fireEvent.pointerDown(ball, { clientX: 100, clientY: 120, screenX: 500, screenY: 700, button: 0 });
    fireEvent.pointerMove(window, { clientX: 100, clientY: 120, screenX: 512, screenY: 712, buttons: 1 });
    fireEvent.pointerMove(window, { clientX: 100, clientY: 120, screenX: 518, screenY: 720, buttons: 1 });
    fireEvent.pointerUp(window, { clientX: 100, clientY: 120, screenX: 518, screenY: 720, button: 0 });
    fireEvent.click(ball);

    expect(onMoveFloatingBall).toHaveBeenCalledTimes(2);
    expect(onMoveFloatingBall).toHaveBeenNthCalledWith(1, 12, 12);
    expect(onMoveFloatingBall).toHaveBeenNthCalledWith(2, 6, 8);
    expect(onSetSimpleModeView).not.toHaveBeenCalled();
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
          panelState: { selectedBoxId: 1, quickPanelOpen: true, simpleMode: true, simpleModeView: "panel" },
        }}
      />
    );

    fireEvent.click(screen.getByTestId("simple-mode-home-button"));

    expect(onExitSimpleMode).toHaveBeenCalledTimes(1);
  });

  it("collapses the simple panel back into the floating ball", () => {
    const onSetSimpleModeView = vi.fn();

    render(
      <AppShell
        onQuickCapture={async () => undefined}
        onSetSimpleModeView={onSetSimpleModeView}
        snapshot={{
          boxes: [
            { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
            { id: 2, name: "123", color: "#2563eb", description: "", sortOrder: 1 },
          ],
          items: [],
          panelState: { selectedBoxId: 1, quickPanelOpen: true, simpleMode: true, simpleModeView: "panel" },
        }}
      />
    );

    fireEvent.click(screen.getByTestId("simple-mode-collapse-button"));

    expect(onSetSimpleModeView).toHaveBeenCalledTimes(1);
    expect(onSetSimpleModeView).toHaveBeenCalledWith("ball");
  });

  it("requests box detail mode on double click in simple panel view", async () => {
    const onSelectBox = vi.fn().mockResolvedValue(undefined);
    const onSetSimpleModeView = vi.fn().mockResolvedValue(undefined);

    render(
      <AppShell
        onQuickCapture={async () => undefined}
        onSelectBox={onSelectBox}
        onSetSimpleModeView={onSetSimpleModeView}
        snapshot={{
          boxes: [
            { id: 1, name: "默认", color: "#f97316", description: "", sortOrder: 0 },
            { id: 2, name: "AI", color: "#2563eb", description: "", sortOrder: 1 },
          ],
          items: [
            {
              id: 41,
              boxId: 1,
              kind: "text",
              title: "",
              content: "第一条笔记",
              sourceUrl: "",
              sourcePath: "",
              bundleCount: 0,
              sortOrder: 0,
              createdAt: "2026-04-08T00:00:00.000Z",
              updatedAt: "2026-04-08T00:00:00.000Z",
            },
          ],
          panelState: { selectedBoxId: 1, quickPanelOpen: true, simpleMode: true, simpleModeView: "panel" },
        }}
      />
    );

    fireEvent.doubleClick(screen.getByRole("button", { name: "选择盒子 默认" }));

    await waitFor(() => expect(onSelectBox).toHaveBeenCalledWith(1));
    await waitFor(() => expect(onSetSimpleModeView).toHaveBeenCalledWith("box"));
  });

  it("renders the full box page when simple mode is in box view", () => {
    render(
      <AppShell
        onQuickCapture={async () => undefined}
        snapshot={{
          boxes: [
            { id: 1, name: "默认", color: "#f97316", description: "", sortOrder: 0 },
            { id: 2, name: "AI", color: "#2563eb", description: "", sortOrder: 1 },
          ],
          items: [
            {
              id: 41,
              boxId: 1,
              kind: "text",
              title: "",
              content: "第一条笔记",
              sourceUrl: "",
              sourcePath: "",
              bundleCount: 0,
              sortOrder: 0,
              createdAt: "2026-04-08T00:00:00.000Z",
              updatedAt: "2026-04-08T00:00:00.000Z",
            },
          ],
          panelState: { selectedBoxId: 1, quickPanelOpen: true, simpleMode: true, simpleModeView: "box" },
        }}
      />
    );

    expect(screen.getByRole("button", { name: "返回主界面" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("搜索标题、内容或路径")).toBeInTheDocument();
    expect(screen.getByText("第一条笔记")).toBeInTheDocument();
    expect(screen.queryByTestId("rail-box-list")).not.toBeInTheDocument();
  });
});
