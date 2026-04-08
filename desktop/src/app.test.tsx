import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./app";

const electronMocks = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn().mockResolvedValue(undefined),
}));

const initialSnapshot = {
  boxes: [{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }],
  items: [],
  panelState: { selectedBoxId: 1, quickPanelOpen: true },
};

vi.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld: electronMocks.exposeInMainWorld,
  },
  ipcRenderer: {
    invoke: electronMocks.invoke,
  },
}));

beforeEach(() => {
  window.brainDesktop = {
    bootstrap: vi.fn().mockResolvedValue(initialSnapshot),
    captureTextOrLink: vi.fn(),
    enrichLinkTitle: vi.fn(),
  };
});

afterEach(() => {
  cleanup();
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

  it("captures a text note and updates the canvas", async () => {
    const captureTextOrLink = vi.fn().mockResolvedValue({
      ...initialSnapshot,
      items: [
        {
          id: 2,
          boxId: 1,
          kind: "text",
          title: "Quick note",
          content: "Quick note",
          sourceUrl: "",
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        },
      ],
    });

    window.brainDesktop = {
      bootstrap: vi.fn().mockResolvedValue(initialSnapshot),
      captureTextOrLink,
      enrichLinkTitle: vi.fn(),
    };

    render(<App />);

    fireEvent.change(await screen.findByPlaceholderText("Paste a link or note"), {
      target: { value: "Quick note" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(captureTextOrLink).toHaveBeenCalledWith("Quick note"));
    expect((await screen.findAllByText("Quick note")).length).toBeGreaterThan(0);
  });

  it("refreshes a link title after enrichment", async () => {
    const captureTextOrLink = vi.fn().mockResolvedValue({
      ...initialSnapshot,
      items: [
        {
          id: 3,
          boxId: 1,
          kind: "link",
          title: "https://example.com",
          content: "https://example.com",
          sourceUrl: "https://example.com",
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        },
      ],
    });
    const enrichLinkTitle = vi.fn().mockResolvedValue({
      ...initialSnapshot,
      items: [
        {
          id: 3,
          boxId: 1,
          kind: "link",
          title: "Example Domain",
          content: "https://example.com",
          sourceUrl: "https://example.com",
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:01.000Z",
        },
      ],
    });

    window.brainDesktop = {
      bootstrap: vi.fn().mockResolvedValue(initialSnapshot),
      captureTextOrLink,
      enrichLinkTitle,
    };

    render(<App />);

    fireEvent.change(await screen.findByPlaceholderText("Paste a link or note"), {
      target: { value: "https://example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(captureTextOrLink).toHaveBeenCalledWith("https://example.com"));
    await waitFor(() => expect(enrichLinkTitle).toHaveBeenCalledWith(3, "https://example.com"));
    expect((await screen.findAllByText("Example Domain")).length).toBeGreaterThan(0);
  });
});

describe("preload bridge", () => {
  beforeEach(() => {
    electronMocks.exposeInMainWorld.mockClear();
    electronMocks.invoke.mockClear();
    vi.resetModules();
  });

  it("exposes capture and enrichment methods", async () => {
    await import("./preload");

    expect(electronMocks.exposeInMainWorld).toHaveBeenCalledWith(
      "brainDesktop",
      expect.objectContaining({
        bootstrap: expect.any(Function),
        captureTextOrLink: expect.any(Function),
        enrichLinkTitle: expect.any(Function),
      })
    );
  });

  it("invokes the capture and enrichment channels", async () => {
    await import("./preload");
    const exposedApi = electronMocks.exposeInMainWorld.mock.calls[0]?.[1] as {
      bootstrap: () => Promise<unknown>;
      captureTextOrLink: (input: string) => Promise<unknown>;
      enrichLinkTitle: (itemId: number, url: string) => Promise<unknown>;
    };

    await exposedApi.bootstrap();
    await exposedApi.captureTextOrLink("Quick note");
    await exposedApi.enrichLinkTitle(42, "https://example.com");

    expect(electronMocks.invoke).toHaveBeenNthCalledWith(1, "workbench/bootstrap");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(
      2,
      "workbench/capture-text-or-link",
      "Quick note"
    );
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(
      3,
      "workbench/enrich-link-title",
      42,
      "https://example.com"
    );
  });
});
