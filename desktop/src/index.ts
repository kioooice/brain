import { app, BrowserWindow, globalShortcut, Tray } from "electron";
import type { Rectangle } from "electron";
import { join } from "node:path";
import { buildTrayMenu, createTrayIcon, shouldHideWindowToTray } from "./main/background";
import {
  captureClipboardNow,
  isClipboardWatcherRunning,
  setClipboardCaptureBoxId,
  startClipboardWatcher,
  stopClipboardWatcher,
} from "./main/clipboard-capture";
import { registerIpc } from "./main/ipc";
import { installApplicationMenu, shouldShowNativeMenu } from "./main/menu";
import { createStore } from "./main/store";
import {
  NORMAL_WINDOW_BOUNDS,
  type WindowLaunchBounds,
  resolveMainModeBounds,
} from "./main/window-bounds";

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

if (require("electron-squirrel-startup")) {
  app.quit();
}

type WindowMode = "main";

let store: ReturnType<typeof createStore>;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let lastWindowMode: WindowMode = "main";
let lastMainWindowBounds: Rectangle | undefined;
const showNativeMenu = shouldShowNativeMenu(app.isPackaged);

function getWindowMode(): WindowMode {
  return "main";
}

function applyWindowAlwaysOnTop(window: BrowserWindow, mode: WindowMode) {
  void mode;
  window.setAlwaysOnTop(false, "normal");
}

function getWindowBoundsForMode(mode: WindowMode): WindowLaunchBounds {
  void mode;
  return resolveMainModeBounds(lastMainWindowBounds);
}

function attachWindowBoundsPersistence(window: BrowserWindow, mode: WindowMode) {
  if (mode === "main") {
    lastMainWindowBounds = window.getBounds();
    window.on("moved", () => {
      lastMainWindowBounds = window.getBounds();
    });
    window.on("resized", () => {
      lastMainWindowBounds = window.getBounds();
    });
    return;
  }
}

function createWindow(mode: WindowMode, bounds?: WindowLaunchBounds): BrowserWindow {
  lastWindowMode = mode;
  const initialBounds = bounds ?? getWindowBoundsForMode(mode);
  const window = new BrowserWindow({
    ...(initialBounds ?? NORMAL_WINDOW_BOUNDS),
    minWidth: NORMAL_WINDOW_BOUNDS.minWidth,
    minHeight: NORMAL_WINDOW_BOUNDS.minHeight,
    resizable: true,
    maximizable: true,
    fullscreenable: true,
    show: false,
    frame: true,
    titleBarStyle: "hiddenInset",
    autoHideMenuBar: !showNativeMenu,
    skipTaskbar: false,
    backgroundColor: "#f4efe7",
    transparent: false,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
    },
  });

  window.setMenuBarVisibility(showNativeMenu);
  applyWindowAlwaysOnTop(window, mode);
  attachWindowBoundsPersistence(window, mode);

  window.on("close", (event) => {
    if (!shouldHideWindowToTray(isQuitting)) {
      return;
    }

    event.preventDefault();
    window.hide();
    window.setSkipTaskbar(true);
  });

  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  window.once("ready-to-show", () => {
    window.show();
  });

  window.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
  return window;
}

function updateApplicationMenu(mode: WindowMode) {
  void mode;
  installApplicationMenu("Brain Desktop", { showNativeMenu });
}

function ensureTray() {
  if (tray) {
    updateTrayMenu();
    return tray;
  }

  tray = new Tray(createTrayIcon());
  tray.setToolTip("Brain Desktop");
  updateTrayMenu();
  tray.on("click", () => {
    showWindow(lastWindowMode);
  });
  return tray;
}

function updateTrayMenu() {
  tray?.setContextMenu(
    buildTrayMenu({
      isClipboardWatcherRunning: isClipboardWatcherRunning(),
      onCaptureClipboard: handleCaptureClipboardNow,
      onToggleClipboardWatcher: handleToggleClipboardWatcher,
      onOpenMain: () => showWindow("main"),
      onQuit: quitApplication,
    })
  );
}

function showWindow(mode: WindowMode) {
  const nextMode = mode;

  updateApplicationMenu(nextMode);
  ensureTray();

  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createWindow(nextMode);
    return;
  }

  mainWindow.setSkipTaskbar(false);
  applyWindowAlwaysOnTop(mainWindow, nextMode);

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
}

function quitApplication() {
  isQuitting = true;
  stopClipboardWatcher();
  tray?.destroy();
  tray = null;
  app.quit();
}

function handleCaptureClipboardNow() {
  const result = captureClipboardNow(store);
  if (result.captured) {
    console.info(`[clipboard-capture] ${result.reason}`);
    return;
  }

  console.info(`[clipboard-capture] ${result.reason}`);
}

function handleToggleClipboardWatcher() {
  const result = isClipboardWatcherRunning() ? stopClipboardWatcher() : startClipboardWatcher(store);
  console.info(`[clipboard-capture] ${result.reason}`);
  updateTrayMenu();
}

function registerGlobalShortcut(accelerator: string, handler: () => void) {
  try {
    const registered = globalShortcut.register(accelerator, handler);
    if (!registered) {
      console.error(`[globalShortcut] 注册失败：${accelerator}`);
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.error(`[globalShortcut] 注册失败：${accelerator}。${message}`);
  }
}

function registerGlobalShortcuts() {
  registerGlobalShortcut("CommandOrControl+Shift+B", handleCaptureClipboardNow);
  registerGlobalShortcut("CommandOrControl+Alt+B", handleToggleClipboardWatcher);
}

function handleSetAlwaysOnTop(enabled: boolean, senderWindowId?: number) {
  const snapshot = store.setAlwaysOnTop(enabled);
  const senderWindow =
    BrowserWindow.getAllWindows().find((window) => window.webContents.id === senderWindowId) ?? mainWindow;

  if (senderWindow && !senderWindow.isDestroyed()) {
    applyWindowAlwaysOnTop(senderWindow, getWindowMode());
  }

  return snapshot;
}

app.whenReady().then(() => {
  store = createStore(join(app.getPath("userData"), "brain-desktop.db"));
  setClipboardCaptureBoxId(store.getWorkbenchSnapshot().boxes[0]?.id ?? null);
  registerIpc(store, {
    onSetAlwaysOnTop: handleSetAlwaysOnTop,
  });
  updateApplicationMenu(getWindowMode());
  ensureTray();
  registerGlobalShortcuts();
  mainWindow = createWindow(getWindowMode());
});

app.on("before-quit", () => {
  isQuitting = true;
  stopClipboardWatcher();
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createWindow(getWindowMode());
    return;
  }

  showWindow(lastWindowMode);
});
