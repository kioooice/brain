import { app, BrowserWindow, globalShortcut, screen, Tray } from "electron";
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
  FLOATING_BALL_BOUNDS,
  NORMAL_WINDOW_BOUNDS,
  SIMPLE_BOX_WINDOW_BOUNDS,
  type WindowLaunchBounds,
  resolveFloatingBallBounds,
  resolveLastMainWindowBounds,
  resolveMainModeBounds,
  resolveSimpleBoxBounds,
  resolveSimpleModeBounds,
  resolveSimpleModeWindowBounds,
  SIMPLE_WINDOW_BOUNDS,
} from "./main/window-bounds";
import type { SimpleModeView } from "./shared/types";

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

if (require("electron-squirrel-startup")) {
  app.quit();
}

type WindowMode = "main" | "simple-ball" | "simple-panel" | "simple-box";

let store: ReturnType<typeof createStore>;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let lastWindowMode: WindowMode = "main";
let lastMainWindowBounds: Rectangle | undefined;
const showNativeMenu = shouldShowNativeMenu(app.isPackaged);

function getSimpleMode() {
  return Boolean(store.getWorkbenchSnapshot().panelState.simpleMode);
}

function getSimpleModeView() {
  const view = store.getWorkbenchSnapshot().panelState.simpleModeView;
  return view === "panel" || view === "box" ? view : "ball";
}

function getWindowMode(): WindowMode {
  if (!getSimpleMode()) {
    return "main";
  }

  const view = getSimpleModeView();
  return view === "panel" ? "simple-panel" : view === "box" ? "simple-box" : "simple-ball";
}

function getSimplePanelBounds(referenceBounds?: Rectangle): Rectangle {
  const display = referenceBounds
    ? screen.getDisplayMatching(referenceBounds)
    : screen.getDisplayNearestPoint(screen.getCursorScreenPoint());

  return referenceBounds
    ? resolveSimpleModeWindowBounds(display.workArea, {
        width: referenceBounds.width,
        height: referenceBounds.height,
      })
    : resolveSimpleModeBounds(display.workArea);
}

function getSimpleBoxBounds(referenceBounds?: Rectangle): Rectangle {
  const display = referenceBounds
    ? screen.getDisplayMatching(referenceBounds)
    : screen.getDisplayNearestPoint(screen.getCursorScreenPoint());

  return referenceBounds
    ? resolveSimpleModeWindowBounds(display.workArea, {
        width: referenceBounds.width,
        height: referenceBounds.height,
      })
    : resolveSimpleBoxBounds(display.workArea);
}

function getFloatingBallBounds(referenceBounds?: Rectangle): Rectangle {
  const snapshot = store.getWorkbenchSnapshot();
  const rememberedBounds = snapshot.panelState.floatingBallBounds ?? referenceBounds;
  const display = rememberedBounds
    ? screen.getDisplayMatching(rememberedBounds)
    : screen.getDisplayNearestPoint(screen.getCursorScreenPoint());

  return resolveFloatingBallBounds(display.workArea, rememberedBounds);
}

function shouldApplyAlwaysOnTop(mode: WindowMode) {
  return mode !== "main";
}

function applyWindowAlwaysOnTop(window: BrowserWindow, mode: WindowMode) {
  window.setAlwaysOnTop(shouldApplyAlwaysOnTop(mode), "normal");
}

function getWindowBoundsForMode(
  mode: WindowMode,
  options: {
    currentWindowBounds?: Rectangle;
    previousMode?: WindowMode;
  } = {}
): WindowLaunchBounds {
  if (mode === "main") {
    return resolveMainModeBounds(lastMainWindowBounds);
  }

  if (mode === "simple-panel") {
    const shouldPreservePanelSize =
      options.previousMode === "simple-panel" && Boolean(options.currentWindowBounds);
    return getSimplePanelBounds(shouldPreservePanelSize ? options.currentWindowBounds : undefined);
  }

  if (mode === "simple-box") {
    const shouldPreserveBoxSize =
      options.previousMode === "simple-box" && Boolean(options.currentWindowBounds);
    return getSimpleBoxBounds(shouldPreserveBoxSize ? options.currentWindowBounds : undefined);
  }

  return getFloatingBallBounds(
    options.previousMode === "simple-ball" ? options.currentWindowBounds : undefined
  );
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

  if (mode === "simple-ball") {
    store.setFloatingBallBounds(window.getBounds());
    window.on("moved", () => {
      store.setFloatingBallBounds(window.getBounds());
    });
  }
}

function createWindow(mode: WindowMode, bounds?: WindowLaunchBounds): BrowserWindow {
  lastWindowMode = mode;
  const simpleMode = mode !== "main";
  const panelMode = mode === "simple-panel" || mode === "simple-box";
  const initialBounds = bounds ?? getWindowBoundsForMode(mode);
  const window = new BrowserWindow({
    ...(initialBounds ?? NORMAL_WINDOW_BOUNDS),
    minWidth:
      mode === "simple-box"
        ? SIMPLE_BOX_WINDOW_BOUNDS.minWidth
        : panelMode
          ? SIMPLE_WINDOW_BOUNDS.minWidth
          : mode === "simple-ball"
            ? FLOATING_BALL_BOUNDS.width
            : NORMAL_WINDOW_BOUNDS.minWidth,
    minHeight:
      mode === "simple-box"
        ? SIMPLE_BOX_WINDOW_BOUNDS.minHeight
        : panelMode
          ? SIMPLE_WINDOW_BOUNDS.minHeight
          : mode === "simple-ball"
            ? FLOATING_BALL_BOUNDS.height
            : NORMAL_WINDOW_BOUNDS.minHeight,
    resizable: mode !== "simple-ball",
    maximizable: mode === "main",
    fullscreenable: mode === "main",
    show: false,
    frame: !simpleMode,
    titleBarStyle: simpleMode ? "default" : "hiddenInset",
    autoHideMenuBar: simpleMode || !showNativeMenu,
    skipTaskbar: simpleMode,
    backgroundColor: mode === "simple-ball" ? "#00000000" : "#f4efe7",
    transparent: mode === "simple-ball",
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
    },
  });

  window.setMenuBarVisibility(showNativeMenu && !simpleMode);
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
  installApplicationMenu("Brain Desktop", {
    simpleMode: mode !== "main",
    showNativeMenu,
    onToggleSimpleMode: handleToggleSimpleMode,
  });
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
      onOpenSimple: () => showWindow("simple-ball"),
      onQuit: quitApplication,
    })
  );
}

function showWindow(mode: WindowMode) {
  const currentMode = getWindowMode();
  const nextMode =
    mode === "simple-ball" || mode === "simple-panel" || mode === "simple-box" ? mode : "main";

  if (nextMode === "main") {
    if (currentMode !== "main") {
      store.setSimpleMode(false);
      rebuildWindowForMode("main", currentMode);
      return;
    }
  } else {
    const desiredView = nextMode === "simple-panel" ? "panel" : nextMode === "simple-box" ? "box" : "ball";
    if (!getSimpleMode()) {
      store.setSimpleMode(true);
      if (desiredView === "panel" || desiredView === "box") {
        store.setSimpleModeView(desiredView);
      }
      rebuildWindowForMode(nextMode, currentMode);
      return;
    }

    if (getSimpleModeView() !== desiredView) {
      store.setSimpleModeView(desiredView);
      rebuildWindowForMode(nextMode, currentMode);
      return;
    }
  }

  updateApplicationMenu(nextMode);
  ensureTray();

  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createWindow(nextMode);
    return;
  }

  mainWindow.setSkipTaskbar(nextMode !== "main");
  applyWindowAlwaysOnTop(mainWindow, nextMode);

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
}

function rebuildWindowForMode(nextMode: WindowMode, previousMode: WindowMode = lastWindowMode) {
  const currentWindow = mainWindow;
  updateApplicationMenu(nextMode);
  ensureTray();
  const currentWindowBounds = currentWindow?.getBounds();

  lastMainWindowBounds = resolveLastMainWindowBounds({
    previousMode: previousMode === "main" ? "main" : "simple",
    currentWindowBounds,
    lastMainWindowBounds,
  });

  const nextWindow = createWindow(
    nextMode,
    getWindowBoundsForMode(nextMode, {
      currentWindowBounds,
      previousMode,
    })
  );
  mainWindow = nextWindow;

  if (currentWindow) {
    nextWindow.once("ready-to-show", () => {
      currentWindow.destroy();
    });
  }
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

function handleToggleSimpleMode(enabled: boolean, senderWindowId?: number) {
  void senderWindowId;
  const previousMode = getWindowMode();
  store.setSimpleMode(enabled);
  rebuildWindowForMode(enabled ? "simple-ball" : "main", previousMode);
}

function handleSetSimpleModeView(view: SimpleModeView, senderWindowId?: number) {
  void senderWindowId;
  const previousMode = getWindowMode();
  store.setSimpleModeView(view);
  rebuildWindowForMode(
    view === "panel" ? "simple-panel" : view === "box" ? "simple-box" : "simple-ball",
    previousMode
  );
}

function handleMoveFloatingBall(deltaX: number, deltaY: number, senderWindowId?: number) {
  const senderWindow =
    BrowserWindow.getAllWindows().find((window) => window.webContents.id === senderWindowId) ?? mainWindow;

  if (!senderWindow || senderWindow.isDestroyed() || getWindowMode() !== "simple-ball") {
    return;
  }

  const currentBounds = senderWindow.getBounds();
  const display = screen.getDisplayMatching(currentBounds);
  const nextBounds = resolveFloatingBallBounds(display.workArea, {
    x: currentBounds.x + Math.round(deltaX),
    y: currentBounds.y + Math.round(deltaY),
    width: currentBounds.width,
    height: currentBounds.height,
  });

  senderWindow.setBounds(nextBounds);
  store.setFloatingBallBounds(nextBounds);
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
    onSetSimpleMode: handleToggleSimpleMode,
    onSetSimpleModeView: handleSetSimpleModeView,
    onMoveFloatingBall: handleMoveFloatingBall,
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
