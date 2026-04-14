import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceDropZone } from "./workspace-drop-zone";

function createDropEvent({
  type,
  paths = [],
  plainText = "",
  uriList = "",
  files = [],
  types,
}: {
  type: string;
  paths?: string[];
  plainText?: string;
  uriList?: string;
  files?: File[];
  types?: string[];
}) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as Event & {
    dataTransfer?: {
      files: Array<{ path?: string }>;
      items?: Array<{ kind: string; type: string; getAsFile(): File | null }>;
      getData(type: string): string;
      types: string[];
    };
  };

  Object.defineProperty(event, "dataTransfer", {
    value: {
      files: [...paths.map((path) => ({ path })), ...files],
      items: files.map((file) => ({
        kind: "file",
        type: file.type,
        getAsFile: () => file,
      })),
      getData: (dataType: string) => {
        if (dataType === "text/plain" || dataType === "text") {
          return plainText;
        }
        if (dataType === "text/uri-list") {
          return uriList;
        }
        return "";
      },
      types:
        types ??
        [
          ...(paths.length || files.length ? ["Files"] : []),
          ...(plainText ? ["text/plain"] : []),
          ...(uriList ? ["text/uri-list"] : []),
        ],
    },
  });

  return event;
}

const fileReaderMocks = vi.hoisted(() => {
  const instances: Array<{
    result: string | ArrayBuffer | null;
    onload: null | (() => void);
    readAsDataURL: ReturnType<typeof vi.fn>;
  }> = [];

  class MockFileReader {
    result: string | ArrayBuffer | null = null;
    onload: null | (() => void) = null;
    readAsDataURL = vi.fn(() => {
      this.result = "data:image/png;base64,ZmFrZQ==";
      this.onload?.();
    });

    constructor() {
      instances.push(this);
    }
  }

  return { MockFileReader, instances };
});

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.stubGlobal("FileReader", fileReaderMocks.MockFileReader);
});

describe("WorkspaceDropZone", () => {
  it("shows the active state while dragging files over the workspace", () => {
    render(
      <WorkspaceDropZone onDropPaths={vi.fn()}>
        <div>Canvas</div>
      </WorkspaceDropZone>
    );

    const zone = screen.getByLabelText("工作区拖放区");
    fireEvent(zone, createDropEvent({ type: "dragenter", paths: ["C:\\assets\\hero.png"] }));

    expect(zone).toHaveAttribute("data-drop-active", "true");
  });

  it("shows the active state when external file drag only exposes the Files type", () => {
    render(
      <WorkspaceDropZone onDropPaths={vi.fn()}>
        <div>Canvas</div>
      </WorkspaceDropZone>
    );

    const zone = screen.getByLabelText("工作区拖放区");
    fireEvent(
      zone,
      createDropEvent({
        type: "dragover",
        types: ["Files"],
      })
    );

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
      screen.getByLabelText("工作区拖放区"),
      createDropEvent({
        type: "drop",
        paths: ["C:\\assets\\hero.png", "C:\\assets\\detail.png"],
      })
    );

    expect(onDropPaths).toHaveBeenCalledWith(["C:\\assets\\hero.png", "C:\\assets\\detail.png"]);
  });

  it("resolves dropped file paths through the desktop bridge when File.path is unavailable", async () => {
    const onDropPaths = vi.fn();
    const originalApi = window.brainDesktop;
    window.brainDesktop = {
      ...window.brainDesktop,
      getPathsForFiles: vi.fn().mockReturnValue(["C:\\docs\\brief.docx"]),
    };

    render(
      <WorkspaceDropZone onDropPaths={onDropPaths}>
        <div>Canvas</div>
      </WorkspaceDropZone>
    );

    const file = new File(["fake"], "brief.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    fireEvent(
      screen.getByLabelText("工作区拖放区"),
      createDropEvent({
        type: "drop",
        files: [file],
      })
    );

    await waitFor(() => expect(onDropPaths).toHaveBeenCalledWith(["C:\\docs\\brief.docx"]));
    window.brainDesktop = originalApi;
  });

  it("forwards dropped text from the window", () => {
    const onDropText = vi.fn();
    render(
      <WorkspaceDropZone onDropPaths={vi.fn()} onDropText={onDropText}>
        <div>Canvas</div>
      </WorkspaceDropZone>
    );

    fireEvent(
      window,
      createDropEvent({
        type: "drop",
        plainText: "Dragged note",
      })
    );

    expect(onDropText).toHaveBeenCalledWith("Dragged note");
  });

  it("forwards pasted plain text only once when paste bubbles from the workspace", async () => {
    const onPasteText = vi.fn();
    render(
      <WorkspaceDropZone onDropPaths={vi.fn()} onPasteText={onPasteText}>
        <div>Canvas</div>
      </WorkspaceDropZone>
    );

    fireEvent.paste(screen.getByLabelText("工作区拖放区"), {
      clipboardData: {
        getData: (type: string) => (type === "text" ? "https://example.com" : ""),
        items: [],
        files: [],
      },
    });

    await waitFor(() => expect(onPasteText).toHaveBeenCalledTimes(1));
    expect(onPasteText).toHaveBeenCalledWith("https://example.com");
  });

  it("forwards pasted plain text from the window without requiring focus", () => {
    const onPasteText = vi.fn();
    render(
      <WorkspaceDropZone onDropPaths={vi.fn()} onPasteText={onPasteText}>
        <div>Canvas</div>
      </WorkspaceDropZone>
    );

    const event = new Event("paste", { bubbles: true, cancelable: true }) as Event & {
      clipboardData?: { getData(type: string): string; items: unknown[]; files: unknown[] };
    };
    Object.defineProperty(event, "clipboardData", {
      value: {
        getData: (type: string) => (type === "text" ? "window paste" : ""),
        items: [],
        files: [],
      },
    });

    fireEvent(window, event);

    expect(onPasteText).toHaveBeenCalledWith("window paste");
  });

  it("forwards pasted image data from the window", async () => {
    const onPasteImage = vi.fn();
    render(
      <WorkspaceDropZone onDropPaths={vi.fn()} onPasteImage={onPasteImage}>
        <div>Canvas</div>
      </WorkspaceDropZone>
    );

    const imageFile = new File(["fake"], "paste.png", { type: "image/png" });
    const event = new Event("paste", { bubbles: true, cancelable: true }) as Event & {
      clipboardData?: {
        getData(type: string): string;
        items: Array<{ kind: string; type: string; getAsFile(): File }>;
        files: File[];
      };
    };
    Object.defineProperty(event, "clipboardData", {
      value: {
        getData: () => "",
        items: [
          {
            kind: "file",
            type: "image/png",
            getAsFile: () => imageFile,
          },
        ],
        files: [imageFile],
      },
    });

    fireEvent(window, event);

    await waitFor(() =>
      expect(onPasteImage).toHaveBeenCalledWith("data:image/png;base64,ZmFrZQ==", "paste.png")
    );
  });

  it("forwards dropped files from the window", () => {
    const onDropPaths = vi.fn();
    render(
      <WorkspaceDropZone onDropPaths={onDropPaths}>
        <div>Canvas</div>
      </WorkspaceDropZone>
    );

    fireEvent(window, createDropEvent({ type: "drop", paths: ["C:\\assets\\window-drop.png"] }));

    expect(onDropPaths).toHaveBeenCalledWith(["C:\\assets\\window-drop.png"]);
  });

  it("forwards dropped image files from the window as image data", async () => {
    const onDropImage = vi.fn();
    render(
      <WorkspaceDropZone onDropPaths={vi.fn()} onDropImage={onDropImage}>
        <div>Canvas</div>
      </WorkspaceDropZone>
    );

    const imageFile = new File(["fake"], "dragged.png", { type: "image/png" });
    fireEvent(window, createDropEvent({ type: "drop", files: [imageFile] }));

    await waitFor(() =>
      expect(onDropImage).toHaveBeenCalledWith("data:image/png;base64,ZmFrZQ==", "dragged.png")
    );
  });

  it("does not intercept paste from input elements", () => {
    const onPasteText = vi.fn();
    render(
      <WorkspaceDropZone onDropPaths={vi.fn()} onPasteText={onPasteText}>
        <input aria-label="inner-input" />
      </WorkspaceDropZone>
    );

    fireEvent.paste(screen.getByLabelText("inner-input"), {
      clipboardData: {
        getData: (type: string) => (type === "text" ? "ignored" : ""),
        items: [],
        files: [],
      },
    });

    expect(onPasteText).not.toHaveBeenCalled();
  });

  it("shows an inline error if the drop handler fails", async () => {
    const onDropPaths = vi.fn().mockRejectedValue(new Error("拖放失败"));
    render(
      <WorkspaceDropZone onDropPaths={onDropPaths}>
        <div>Canvas</div>
      </WorkspaceDropZone>
    );

    fireEvent(
      screen.getByLabelText("工作区拖放区"),
      createDropEvent({
        type: "drop",
        paths: ["C:\\assets\\hero.png"],
      })
    );

    expect(await screen.findByText("拖放失败")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText("工作区拖放区")).toHaveAttribute("data-drop-active", "false")
    );
  });
});
