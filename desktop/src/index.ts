import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { createStore } from "./main/store";
import { registerIpc } from "./main/ipc";

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

if (require("electron-squirrel-startup")) {
  app.quit();
}

const createWindow = (): BrowserWindow => {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1120,
    minHeight: 760,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#f4efe7",
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
  return mainWindow;
};

app.whenReady().then(() => {
  const store = createStore(join(app.getPath("userData"), "brain-desktop.db"));
  registerIpc(store);
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
