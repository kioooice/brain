import { Menu, nativeImage } from "electron";
import type { MenuItemConstructorOptions, NativeImage } from "electron";

export type WindowMode = "main" | "simple";

export function shouldHideWindowToTray(isQuitting: boolean) {
  return !isQuitting;
}

export function buildTrayMenuTemplate(options: {
  onOpenMain: () => void;
  onOpenSimple: () => void;
  onQuit: () => void;
}): MenuItemConstructorOptions[] {
  return [
    {
      label: "打开主界面",
      click: options.onOpenMain,
    },
    {
      label: "打开简易模式",
      click: options.onOpenSimple,
    },
    {
      type: "separator",
    },
    {
      label: "退出",
      click: options.onQuit,
    },
  ];
}

export function buildTrayMenu(options: {
  onOpenMain: () => void;
  onOpenSimple: () => void;
  onQuit: () => void;
}) {
  return Menu.buildFromTemplate(buildTrayMenuTemplate(options));
}

export function buildTrayIconDataUrl() {
  return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAACISURBVDhPYxgFNAZd8aYS/XHGy3vijTWgQsSD/nhTg7444/O98SYR/XEmx/vjjR2gUoQBTBPIBSB+f7y+QF+cyX6goQlgBYRAX7zJsfp4ew4oFw764k0PQ5n4QX+8yX8QDfICiA3CMDZYASEAU4isAWYQlIsfAP17H0q/h2kEsWHiowAZMDAAALN4O547+cCFAAAAAElFTkSuQmCC";
}

export function createTrayIcon(): NativeImage {
  return nativeImage
    .createFromDataURL(buildTrayIconDataUrl())
    .resize({ width: 16, height: 16 });
}
