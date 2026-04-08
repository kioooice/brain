import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./app";

const electronMocks = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn().mockResolvedValue(undefined),
}));

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
