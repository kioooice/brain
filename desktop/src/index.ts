import { app, BrowserWindow, screen, Tray } from "electron";
import type { Rectangle } from "electron";
import { join } from "node:path";
import { buildTrayMenu, createTrayIcon, shouldHideWindowToTray } from "./main/background";
import { registerIpc } from "./main/ipc";
import { installApplicationMenu, shouldShowNativeMenu } from "./main/menu";
import { createStore } from "./main/store";
import {
  NORMAL_WINDOW_BOUNDS,
  resolveLastMainWindowBounds,
  resolveMainModeBounds,
  resolveSimpleModeBounds,
  resolveSimpleModeWindowBounds,
  SIMPLE_WINDOW_BOUNDS,
} from "./main/window-bounds";

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

if (require("electron-squirrel-startup")) {
  app.quit();
}

let store: ReturnType<typeof createStore>;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let lastWindowMode: "main" | "simple" = "main";
let lastMainWindowBounds: Rectangle | undefined;
const showNativeMenu = shouldShowNativeMenu(app.isPackaged);

function getSimpleMode() {
  return Boolean(store.getWorkbenchSnapshot().panelState.simpleMode);
}

function getWindowMode() {
  return getSimpleMode() ? "simple" : "main";
}

function getSimpleModeBounds(): Rectangle {
  const workArea = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  return resolveSimpleModeBounds(workArea);
}

function positionSimpleModeWindow(window: BrowserWindow, referenceBounds?: Rectangle) {
  const display = referenceBounds
    ? screen.getDisplayMatching(referenceBounds)
    : screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const currentBounds = window.getBounds();

  window.setBounds(
    resolveSimpleModeWindowBounds(display.workArea, {
      width: currentBounds.width,
      height: currentBounds.height,
    })
  );
}

function shouldApplyAlwaysOnTop(simpleMode: boolean) {
  return simpleMode && Boolean(store.getWorkbenchSnapshot().panelState.alwaysOnTop);
}

function applyWindowAlwaysOnTop(window: BrowserWindow, simpleMode: boolean) {
  window.setAlwaysOnTop(shouldApplyAlwaysOnTop(simpleMode), "normal");
}

function createWindow(simpleMode = getSimpleMode(), bounds?: Rectangle): BrowserWindow {
  lastWindowMode = simpleMode ? "simple" : "main";
  const initialBounds = simpleMode ? getSimpleModeBounds() : resolveMainModeBounds(bounds);
  const window = new BrowserWindow({
    ...(initialBounds ?? NORMAL_WINDOW_BOUNDS),
    minWidth: simpleMode ? SIMPLE_WINDOW_BOUNDS.minWidth : NORMAL_WINDOW_BOUNDS.minWidth,
    minHeight: simpleMode ? SIMPLE_WINDOW_BOUNDS.minHeight : NORMAL_WINDOW_BOUNDS.minHeight,
    show: false,
    frame: !simpleMode,
    titleBarStyle: simpleMode ? "default" : "hiddenInset",
    autoHideMenuBar: simpleMode || !showNativeMenu,
    skipTaskbar: simpleMode,
    backgroundColor: "#f4efe7",
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
    },
  });

  window.setMenuBarVisibility(showNativeMenu && !simpleMode);
  applyWindowAlwaysOnTop(window, simpleMode);
  if (!simpleMode) {
    lastMainWindowBounds = window.getBounds();
    window.on("moved", () => {
      lastMainWindowBounds = window.getBounds();
    });
    window.on("resized", () => {
      lastMainWindowBounds = window.getBounds();
    });
  }
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
    if (simpleMode) {
      positionSimpleModeWindow(window, bounds);
    }
    window.show();
  });
  window.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
  return window;
}

function updateApplicationMenu(simpleMode: boolean) {
  installApplicationMenu("Brain Desktop", {
    simpleMode,
    showNativeMenu,
    onToggleSimpleMode: handleToggleSimpleMode,
  });
}

function ensureTray() {
  if (tray) {
    return tray;
  }

  tray = new Tray(createTrayIcon());
  tray.setToolTip("Brain Desktop");
  tray.setContextMenu(
    buildTrayMenu({
      onOpenMain: () => showWindow("main"),
      onOpenSimple: () => showWindow("simple"),
      onQuit: quitApplication,
    })
  );
  tray.on("click", () => {
    showWindow(lastWindowMode);
  });
  return tray;
}

function showWindow(mode: "main" | "simple") {
  const simpleMode = mode === "simple";
  lastWindowMode = mode;

  if (getSimpleMode() !== simpleMode) {
    store.setSimpleMode(simpleMode);
    rebuildWindowForMode(simpleMode);
    return;
  }

  updateApplicationMenu(simpleMode);
  ensureTray();

  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createWindow(simpleMode);
    return;
  }

  mainWindow.setSkipTaskbar(simpleMode);
  applyWindowAlwaysOnTop(mainWindow, simpleMode);
  if (simpleMode) {
    positionSimpleModeWindow(mainWindow);
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
}

function rebuildWindowForMode(simpleMode: boolean, previousMode: "main" | "simple" = lastWindowMode) {
  const currentWindow = mainWindow;
  updateApplicationMenu(simpleMode);
  ensureTray();
  const currentWindowBounds = currentWindow?.getBounds();

  lastMainWindowBounds = resolveLastMainWindowBounds({
    previousMode,
    currentWindowBounds,
    lastMainWindowBounds,
  });

  const nextWindow = createWindow(simpleMode, simpleMode ? currentWindowBounds : lastMainWindowBounds);
  mainWindow = nextWindow;

  if (currentWindow) {
    nextWindow.once("ready-to-show", () => {
      currentWindow.destroy();
    });
  }
}

function quitApplication() {
  isQuitting = true;
  tray?.destroy();
  tray = null;
  app.quit();
}

function handleToggleSimpleMode(enabled: boolean, senderWindowId?: number) {
  void senderWindowId;
  const previousMode = getSimpleMode() ? "simple" : "main";
  store.setSimpleMode(enabled);
  rebuildWindowForMode(enabled, previousMode);
}

function handleSetAlwaysOnTop(enabled: boolean, senderWindowId?: number) {
  const snapshot = store.setAlwaysOnTop(enabled);
  const senderWindow =
    BrowserWindow.getAllWindows().find((window) => window.webContents.id === senderWindowId) ?? mainWindow;

  if (senderWindow && !senderWindow.isDestroyed()) {
    applyWindowAlwaysOnTop(senderWindow, Boolean(snapshot.panelState.simpleMode));
  }

  return snapshot;
}

app.whenReady().then(() => {
  store = createStore(join(app.getPath("userData"), "brain-desktop.db"));
  registerIpc(store, {
    onSetSimpleMode: handleToggleSimpleMode,
    onSetAlwaysOnTop: handleSetAlwaysOnTop,
  });
  updateApplicationMenu(getSimpleMode());
  ensureTray();
  mainWindow = createWindow(getSimpleMode());
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createWindow(getSimpleMode());
    return;
  }

  showWindow(lastWindowMode ?? getWindowMode());
});
