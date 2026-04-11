import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuickCapture } from "./quick-capture";

afterEach(() => {
  cleanup();
});

describe("QuickCapture", () => {
  it("submits non-empty input and clears the field", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<QuickCapture activeBoxName="Inbox" onSubmit={onSubmit} />);

    fireEvent.change(screen.getByPlaceholderText("粘贴链接或笔记"), {
      target: { value: "https://example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("https://example.com"));
    expect(screen.getByPlaceholderText("粘贴链接或笔记")).toHaveValue("");
  });

  it("does not submit blank input", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<QuickCapture activeBoxName="Inbox" onSubmit={onSubmit} />);

    fireEvent.change(screen.getByPlaceholderText("粘贴链接或笔记"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加" }));

    await waitFor(() => expect(onSubmit).not.toHaveBeenCalled());
  });

  it("shows an inline error if submit fails", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("收集失败"));

    render(<QuickCapture activeBoxName="Inbox" onSubmit={onSubmit} />);

    fireEvent.change(screen.getByPlaceholderText("粘贴链接或笔记"), {
      target: { value: "Broken" },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加" }));

    expect(await screen.findByText("收集失败")).toBeInTheDocument();
  });
});
