import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceDropZone } from "./workspace-drop-zone";

function createDropEvent(type: string, paths: string[]) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent<HTMLDivElement>;
  Object.defineProperty(event, "dataTransfer", {
    value: {
      files: paths.map((path) => ({ path })),
    },
  });
  return event;
}

afterEach(() => {
  cleanup();
});

describe("WorkspaceDropZone", () => {
  it("shows the active state while dragging files over the workspace", () => {
    render(
      <WorkspaceDropZone onDropPaths={vi.fn()}>
        <div>Canvas</div>
      </WorkspaceDropZone>
    );

    const zone = screen.getByLabelText("Workspace Drop Zone");
    fireEvent(zone, createDropEvent("dragenter", ["C:\\assets\\hero.png"]));

    expect(zone).toHaveAttribute("data-drop-active", "true");
  });

  it("forwards dropped absolute paths", () => {
    const onDropPaths = vi.fn();
    render(
      <WorkspaceDropZone onDropPaths={onDropPaths}>
        <div>Canvas</div>
      </WorkspaceDropZone>
    );

    fireEvent(
      screen.getByLabelText("Workspace Drop Zone"),
      createDropEvent("drop", ["C:\\assets\\hero.png", "C:\\assets\\detail.png"])
    );

    expect(onDropPaths).toHaveBeenCalledWith(["C:\\assets\\hero.png", "C:\\assets\\detail.png"]);
  });

  it("shows an inline error if the drop handler fails", async () => {
    const onDropPaths = vi.fn().mockRejectedValue(new Error("Drop failed"));
    render(
      <WorkspaceDropZone onDropPaths={onDropPaths}>
        <div>Canvas</div>
      </WorkspaceDropZone>
    );

    fireEvent(
      screen.getByLabelText("Workspace Drop Zone"),
      createDropEvent("drop", ["C:\\assets\\hero.png"])
    );

    expect(await screen.findByText("Drop failed")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Workspace Drop Zone")).toHaveAttribute("data-drop-active", "false"));
  });
});
