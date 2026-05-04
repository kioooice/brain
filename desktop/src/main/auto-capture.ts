import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { desktopCapturer, protocol, screen } from "electron";
import { AUTO_CAPTURE_IMAGE_PROTOCOL } from "../shared/auto-capture-url";
import type { AutoCapturePauseReason, AutoCaptureSnapshot } from "../shared/types";
import type { DesktopStore } from "./store";
import { runWindowsOcr } from "./windows-ocr";

const execFileAsync = promisify(execFile);
const DEFAULT_INTERVAL_MS = 60_000;
const MIN_INTERVAL_MS = 15_000;
const DEFAULT_RETENTION_MS = 12 * 60 * 60 * 1000;
const DEFAULT_CAPTURE_MAX_EDGE = 1600;
const DEFAULT_JPEG_QUALITY = 72;

type OcrResult = {
  text: string;
  available: boolean;
  status: string;
};

type AutoCaptureContext = {
  store: DesktopStore;
  captureDirectory: string;
  retentionMs: number;
  captureDesktopImage: () => Promise<Buffer>;
  runOcr: (imagePath: string) => Promise<OcrResult>;
};

let context: AutoCaptureContext | null = null;
let captureTimer: ReturnType<typeof setInterval> | null = null;
let running = false;
let pauseReason: AutoCapturePauseReason = "manual";
let intervalMs = DEFAULT_INTERVAL_MS;
let lastError = "";
let ocrAvailable = false;
let ocrStatus = "等待首次识别";
let captureInFlight = false;
let protocolRegistered = false;
const snapshotListeners = new Set<(snapshot: AutoCaptureSnapshot) => void>();

function normalizeIntervalMs(input: number | undefined) {
  if (!input || !Number.isFinite(input)) {
    return DEFAULT_INTERVAL_MS;
  }
  return Math.max(MIN_INTERVAL_MS, Math.round(input));
}

function withStatus(snapshot: AutoCaptureSnapshot): AutoCaptureSnapshot {
  return {
    ...snapshot,
    running,
    paused: !running,
    pauseReason: running ? null : pauseReason ?? "manual",
    intervalMs,
    lastError,
    ocrAvailable,
    ocrStatus,
  };
}

function parseAutoCaptureEntryId(requestUrl: string) {
  try {
    const url = new URL(requestUrl);
    if (url.protocol !== `${AUTO_CAPTURE_IMAGE_PROTOCOL}:` || url.hostname !== "entry") {
      return null;
    }
    const idText = url.pathname.replace(/^\//, "").replace(/\.[^.]+$/, "");
    const entryId = Number(idText);
    return Number.isInteger(entryId) && entryId > 0 ? entryId : null;
  } catch {
    return null;
  }
}

function isPathInsideDirectory(targetPath: string, directory: string) {
  const resolvedTarget = resolve(targetPath);
  const resolvedDirectory = resolve(directory);
  const pathDelta = relative(resolvedDirectory, resolvedTarget);
  return pathDelta === "" || (!pathDelta.startsWith("..") && !isAbsolute(pathDelta));
}

function scaleToMaxEdge(width: number, height: number, maxEdge: number) {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const longestEdge = Math.max(safeWidth, safeHeight);
  if (longestEdge <= maxEdge) {
    return {
      width: safeWidth,
      height: safeHeight,
    };
  }

  const scale = maxEdge / longestEdge;
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
}

function getRetentionCutoffIso(retentionMs: number) {
  return new Date(Date.now() - retentionMs).toISOString();
}

function notifyAutoCaptureChanged(snapshot: AutoCaptureSnapshot) {
  snapshotListeners.forEach((listener) => listener(snapshot));
}

async function defaultCaptureDesktopImage() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const size = primaryDisplay.size ?? primaryDisplay.bounds;
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: {
      width: Math.max(1, Math.round(size.width)),
      height: Math.max(1, Math.round(size.height)),
    },
  });
  const source =
    sources.find((entry) => entry.display_id === String(primaryDisplay.id)) ??
    sources.find((entry) => !entry.thumbnail.isEmpty()) ??
    sources[0];

  if (!source || source.thumbnail.isEmpty()) {
    throw new Error("没有可用的桌面画面");
  }

  const imageSize = source.thumbnail.getSize();
  const targetSize = scaleToMaxEdge(imageSize.width, imageSize.height, DEFAULT_CAPTURE_MAX_EDGE);
  return source.thumbnail.resize({ ...targetSize, quality: "good" }).toJPEG(DEFAULT_JPEG_QUALITY);
}

async function runTesseractOcr(imagePath: string): Promise<OcrResult> {
  try {
    const result = await execFileAsync(
      "tesseract",
      [imagePath, "stdout", "-l", "chi_sim+eng", "--psm", "6"],
      {
        timeout: 20_000,
        windowsHide: true,
        maxBuffer: 2 * 1024 * 1024,
      }
    );
    return {
      text: result.stdout.trim(),
      available: true,
      status: "Tesseract OCR 已启用",
    };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "OCR 不可用";
    const missing = /ENOENT|not recognized|找不到|无法将/i.test(message);
    return {
      text: "",
      available: false,
      status: missing ? "未检测到 tesseract，已先保存图片" : "OCR 失败，已先保存图片",
    };
  }
}

async function defaultRunOcr(imagePath: string): Promise<OcrResult> {
  const windowsResult = await runWindowsOcr(imagePath);
  if (windowsResult.available) {
    return windowsResult;
  }

  const tesseractResult = await runTesseractOcr(imagePath);
  return tesseractResult.available ? tesseractResult : windowsResult;
}

export function configureAutoCapture(options: {
  store: DesktopStore;
  captureDirectory: string;
  retentionMs?: number;
  captureDesktopImage?: () => Promise<Buffer>;
  captureDesktopPng?: () => Promise<Buffer>;
  runOcr?: (imagePath: string) => Promise<OcrResult>;
}) {
  context = {
    store: options.store,
    captureDirectory: options.captureDirectory,
    retentionMs: options.retentionMs ?? DEFAULT_RETENTION_MS,
    captureDesktopImage: options.captureDesktopImage ?? options.captureDesktopPng ?? defaultCaptureDesktopImage,
    runOcr: options.runOcr ?? defaultRunOcr,
  };
}

export function registerAutoCaptureProtocol(store: DesktopStore, captureDirectory: string) {
  if (protocolRegistered) {
    return;
  }

  protocolRegistered = true;
  protocol.registerFileProtocol(AUTO_CAPTURE_IMAGE_PROTOCOL, (request, callback) => {
    const entryId = parseAutoCaptureEntryId(request.url);
    if (entryId == null) {
      callback({ error: -6 });
      return;
    }

    const imagePath = store.getAutoCaptureEntryPath(entryId);
    if (!imagePath || !isPathInsideDirectory(imagePath, captureDirectory)) {
      callback({ error: -6 });
      return;
    }

    callback({ path: imagePath });
  });
}

export function subscribeAutoCaptureSnapshots(listener: (snapshot: AutoCaptureSnapshot) => void) {
  snapshotListeners.add(listener);
  return () => {
    snapshotListeners.delete(listener);
  };
}

function getContext() {
  if (!context) {
    throw new Error("自动记录尚未初始化");
  }
  return context;
}

export function getAutoCaptureSnapshot(query = "") {
  const activeContext = getContext();
  return withStatus(activeContext.store.getAutoCaptureSnapshot(query));
}

export async function captureDesktopNow() {
  const activeContext = getContext();
  if (!running) {
    return getAutoCaptureSnapshot();
  }

  if (captureInFlight) {
    return getAutoCaptureSnapshot();
  }

  captureInFlight = true;
  try {
    await mkdir(activeContext.captureDirectory, { recursive: true });
    if (!running) {
      return getAutoCaptureSnapshot();
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const imagePath = join(activeContext.captureDirectory, `${timestamp}.jpg`);
    const image = await activeContext.captureDesktopImage();
    if (!running) {
      return getAutoCaptureSnapshot();
    }

    await writeFile(imagePath, image);
    if (!running) {
      await rm(imagePath, { force: true }).catch(() => undefined);
      return getAutoCaptureSnapshot();
    }

    const ocr = await activeContext.runOcr(imagePath);
    if (!running) {
      await rm(imagePath, { force: true }).catch(() => undefined);
      return getAutoCaptureSnapshot();
    }

    ocrAvailable = ocr.available;
    ocrStatus = ocr.status;
    lastError = "";
    activeContext.store.addAutoCaptureEntry(imagePath, ocr.text);
    const expiredPaths = activeContext.store.pruneAutoCaptureEntriesBefore(
      getRetentionCutoffIso(activeContext.retentionMs)
    );
    await Promise.all(expiredPaths.map((expiredPath) => rm(expiredPath, { force: true }).catch(() => undefined)));
    const snapshot = withStatus(activeContext.store.getAutoCaptureSnapshot());
    notifyAutoCaptureChanged(snapshot);
    return snapshot;
  } catch (cause) {
    lastError = cause instanceof Error ? cause.message : "自动截屏失败";
    const snapshot = getAutoCaptureSnapshot();
    notifyAutoCaptureChanged(snapshot);
    return snapshot;
  } finally {
    captureInFlight = false;
  }
}

export async function cleanupExpiredAutoCaptures() {
  const activeContext = getContext();
  const expiredPaths = activeContext.store.pruneAutoCaptureEntriesBefore(
    getRetentionCutoffIso(activeContext.retentionMs)
  );
  await Promise.all(expiredPaths.map((expiredPath) => rm(expiredPath, { force: true }).catch(() => undefined)));
  const snapshot = withStatus(activeContext.store.getAutoCaptureSnapshot());
  notifyAutoCaptureChanged(snapshot);

  return {
    snapshot,
    removedFiles: expiredPaths.length,
    removedBytes: 0,
  };
}

export function startAutoCapture(nextIntervalMs?: number) {
  getContext();
  intervalMs = normalizeIntervalMs(nextIntervalMs);
  if (captureTimer) {
    clearInterval(captureTimer);
  }
  running = true;
  pauseReason = null;
  captureTimer = setInterval(() => {
    void captureDesktopNow();
  }, intervalMs);
  const snapshot = getAutoCaptureSnapshot();
  notifyAutoCaptureChanged(snapshot);
  void captureDesktopNow();
  return snapshot;
}

function pauseAutoCapture(reason: Exclude<AutoCapturePauseReason, null>) {
  if (captureTimer) {
    clearInterval(captureTimer);
    captureTimer = null;
  }
  running = false;
  pauseReason = reason;
  const snapshot = getAutoCaptureSnapshot();
  notifyAutoCaptureChanged(snapshot);
  return snapshot;
}

export function stopAutoCapture() {
  return pauseAutoCapture("manual");
}

export function pauseAutoCaptureForPrivacy() {
  return pauseAutoCapture("privacy");
}

export async function deleteAutoCaptureEntry(entryId: number) {
  const activeContext = getContext();
  const paths = activeContext.store.getAutoCaptureEntryPaths(entryId);
  const snapshot = withStatus(activeContext.store.deleteAutoCaptureEntry(entryId));
  await Promise.all(paths.map((imagePath) => rm(imagePath, { force: true }).catch(() => undefined)));
  notifyAutoCaptureChanged(snapshot);
  return snapshot;
}

export async function clearAutoCaptures() {
  const activeContext = getContext();
  const paths = activeContext.store.getAutoCaptureEntryPaths();
  const snapshot = withStatus(activeContext.store.clearAutoCaptureEntries());
  await Promise.all(paths.map((imagePath) => rm(imagePath, { force: true }).catch(() => undefined)));
  notifyAutoCaptureChanged(snapshot);
  return snapshot;
}
