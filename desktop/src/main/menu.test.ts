import { describe, expect, it, vi } from "vitest";
import { buildApplicationMenuTemplate, shouldShowNativeMenu } from "./menu";

describe("buildApplicationMenuTemplate", () => {
  it("keeps native menus in development and hides them when packaged", () => {
    expect(shouldShowNativeMenu(false)).toBe(true);
    expect(shouldShowNativeMenu(true)).toBe(false);
  });

  it("builds a Chinese application menu for Windows", () => {
    const onToggleSimpleMode = vi.fn();
    const template = buildApplicationMenuTemplate("Brain Desktop", "win32", { onToggleSimpleMode });

    expect(template.map((item) => item.label)).toEqual(["文件", "编辑", "视图", "窗口", "帮助", "简易模式"]);
    expect(template[0].submenu).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "退出", role: "quit" })])
    );
    expect(template[2].submenu).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "重新加载", role: "reload" }),
        expect.objectContaining({ label: "强制重新加载", role: "forceReload" }),
        expect.objectContaining({ label: "切换开发者工具", role: "toggleDevTools" }),
        expect.objectContaining({ label: "实际大小", role: "resetZoom" }),
        expect.objectContaining({ label: "放大", role: "zoomIn" }),
        expect.objectContaining({ label: "缩小", role: "zoomOut" }),
        expect.objectContaining({ label: "切换全屏", role: "togglefullscreen" }),
      ])
    );
    expect(template[5]).toEqual(expect.objectContaining({ label: "简易模式" }));

    template[5].click?.({} as never, {} as never, {} as never);
    expect(onToggleSimpleMode).toHaveBeenCalledWith(true);
  });

  it("toggles simple mode off when the top-level menu is clicked in simple mode", () => {
    const onToggleSimpleMode = vi.fn();
    const template = buildApplicationMenuTemplate("Brain Desktop", "win32", {
      simpleMode: true,
      onToggleSimpleMode,
    });

    template[5].click?.({} as never, {} as never, {} as never);
    expect(onToggleSimpleMode).toHaveBeenCalledWith(false);
  });
});
