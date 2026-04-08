import { beforeEach, describe, expect, it, vi } from "vitest";

const renderSpy = vi.fn();
const createRootSpy = vi.fn(() => ({ render: renderSpy }));

vi.mock("react-dom/client", () => ({
  createRoot: createRootSpy,
}));

describe("renderer bootstrap", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    renderSpy.mockClear();
    createRootSpy.mockClear();
  });

  it("mounts the app into the root container", async () => {
    await import("./renderer");

    const container = document.getElementById("root");
    expect(createRootSpy).toHaveBeenCalledWith(container);
    expect(renderSpy).toHaveBeenCalledTimes(1);
  });
});
