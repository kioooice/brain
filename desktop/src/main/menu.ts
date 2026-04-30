import { Menu } from "electron";
import type { MenuItemConstructorOptions } from "electron";

export function shouldShowNativeMenu(isPackaged = false) {
  return !isPackaged;
}

export function buildApplicationMenuTemplate(
  productName = "Brain Desktop",
  platform = process.platform
): MenuItemConstructorOptions[] {
  const isMac = platform === "darwin";

  return [
    {
      label: "文件",
      submenu: [isMac ? { label: "关闭窗口", role: "close" } : { label: "退出", role: "quit" }],
    },
    {
      label: "编辑",
      submenu: [
        { label: "撤销", role: "undo" },
        { label: "重做", role: "redo" },
        { type: "separator" },
        { label: "剪切", role: "cut" },
        { label: "复制", role: "copy" },
        { label: "粘贴", role: "paste" },
        { label: "全选", role: "selectAll" },
      ],
    },
    {
      label: "视图",
      submenu: [
        { label: "重新加载", role: "reload" },
        { label: "强制重新加载", role: "forceReload" },
        { label: "切换开发者工具", role: "toggleDevTools" },
        { type: "separator" },
        { label: "实际大小", role: "resetZoom" },
        { label: "放大", role: "zoomIn" },
        { label: "缩小", role: "zoomOut" },
        { type: "separator" },
        { label: "切换全屏", role: "togglefullscreen" },
      ],
    },
    {
      label: "窗口",
      submenu: [
        { label: "最小化", role: "minimize" },
        { label: "关闭", role: "close" },
      ],
    },
    {
      label: "帮助",
      submenu: [{ label: `关于 ${productName}`, enabled: false }],
    },
  ];
}

export function installApplicationMenu(
  productName = "Brain Desktop",
  options: {
    showNativeMenu?: boolean;
  } = {}
) {
  if (options.showNativeMenu === false) {
    Menu.setApplicationMenu(null);
    return;
  }

  const menu = Menu.buildFromTemplate(buildApplicationMenuTemplate(productName, process.platform));
  Menu.setApplicationMenu(menu);
}
