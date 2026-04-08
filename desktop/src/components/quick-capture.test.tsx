import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach } from "vitest";
import { describe, expect, it, vi } from "vitest";
import { QuickCapture } from "./quick-capture";

afterEach(() => {
  cleanup();
});

describe("QuickCapture", () => {
  it("submits non-empty input and clears the field", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<QuickCapture activeBoxName="Inbox" onSubmit={onSubmit} />);

    fireEvent.change(screen.getByPlaceholderText("Paste a link or note"), {
      target: { value: "https://example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("https://example.com"));
    expect(screen.getByPlaceholderText("Paste a link or note")).toHaveValue("");
  });

  it("does not submit blank input", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<QuickCapture activeBoxName="Inbox" onSubmit={onSubmit} />);

    fireEvent.change(screen.getByPlaceholderText("Paste a link or note"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(onSubmit).not.toHaveBeenCalled());
  });

  it("shows an inline error if submit fails", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("Capture failed"));

    render(<QuickCapture activeBoxName="Inbox" onSubmit={onSubmit} />);

    fireEvent.change(screen.getByPlaceholderText("Paste a link or note"), {
      target: { value: "Broken" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText("Capture failed")).toBeInTheDocument();
  });
});
