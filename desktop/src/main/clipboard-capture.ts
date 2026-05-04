import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { app, clipboard } from "electron";
import type { WorkbenchSnapshot } from "../shared/types";
import {
  buildFingerprint,
  hydrateRecentFingerprints,
  isDuplicateRecent,
  rememberFingerprint,
  serializeRecentFingerprints,
  shouldIgnoreText,
  type RecentFingerprintEntry,
} from "./dedupe";
import type { DesktopStore } from "./store";

export type ClipboardCaptureContent =
  | { kind: "text"; value: string }
  | { kind: "image"; value: string; title: string }
  | { kind: "empty"; reason: string };

export type ClipboardCaptureResult = {
  captured: boolean;
  kind: ClipboardCaptureContent["kind"];
  reason: string;
  snapshot?: WorkbenchSnapshot;
};

type ClipboardCaptureResultListener = (result: ClipboardCaptureResult) => void;

let watcherTimer: ReturnType<typeof setInterval> | null = null;
let captureTargetBoxId: number | null = null;
let watcherLastFingerprint = "";
let persistentDedupeLoaded = false;
const captureResultListeners = new Set<ClipboardCaptureResultListener>();
const DEDUPE_STATE_FILE_NAME = "brain-recent-captures.json";

type StoredDedupeState = {
  fingerprints?: unknown;
};

export function setClipboardCaptureBoxId(boxId: number | null) {
  captureTargetBoxId = boxId;
}

export function getClipboardCaptureBoxId() {
  return captureTargetBoxId;
}

export function subscribeClipboardCaptureResults(listener: ClipboardCaptureResultListener) {
  captureResultListeners.add(listener);
  return () => {
    captureResultListeners.delete(listener);
  };
}

function emitClipboardCaptureResult(result: ClipboardCaptureResult) {
  captureResultListeners.forEach((listener) => listener(result));
}

export function readClipboardTextOrImage(): ClipboardCaptureContent {
  try {
    const image = clipboard.readImage();
    if (!image.isEmpty()) {
      const dataUrl = image.toDataURL();
      if (dataUrl.trim()) {
        return { kind: "image", value: dataUrl, title: "剪贴板图片" };
      }
    }

    const text = clipboard.readText().trim();
    if (!text) {
      return { kind: "empty", reason: "剪贴板为空" };
    }

    return { kind: "text", value: text };
  } catch (cause) {
    return {
      kind: "empty",
      reason: cause instanceof Error ? cause.message : "读取剪贴板失败",
    };
  }
}

function getContentFingerprint(content: ClipboardCaptureContent) {
  if (content.kind === "empty") {
    return "";
  }

  return buildFingerprint(content.kind, content.value);
}

function getRecentStagingBoxId(store: DesktopStore) {
  return captureTargetBoxId ?? store.getWorkbenchSnapshot().boxes[0]?.id ?? null;
}

function getDedupeStatePath() {
  try {
    const userDataPath = app?.getPath?.("userData");
    return userDataPath ? join(userDataPath, DEDUPE_STATE_FILE_NAME) : "";
  } catch {
    return "";
  }
}

function readPersistentDedupeState() {
  if (persistentDedupeLoaded) {
    return;
  }

  persistentDedupeLoaded = true;
  const statePath = getDedupeStatePath();
  if (!statePath || !existsSync(statePath)) {
    return;
  }

  try {
    const parsed = JSON.parse(readFileSync(statePath, "utf8")) as StoredDedupeState;
    const entries = Array.isArray(parsed.fingerprints)
      ? parsed.fingerprints.filter((entry): entry is RecentFingerprintEntry => {
          return (
            entry != null &&
            typeof entry === "object" &&
            typeof (entry as RecentFingerprintEntry).fingerprint === "string" &&
            typeof (entry as RecentFingerprintEntry).lastSeenAt === "number"
          );
        })
      : [];
    hydrateRecentFingerprints(entries);
  } catch {
    // Ignore corrupt short-lived dedupe state; the next successful capture rewrites it.
  }
}

function writePersistentDedupeState() {
  const statePath = getDedupeStatePath();
  if (!statePath) {
    return;
  }

  try {
    mkdirSync(dirname(statePath), { recursive: true });
    writeFileSync(
      statePath,
      JSON.stringify(
        {
          fingerprints: serializeRecentFingerprints(),
        },
        null,
        2
      ),
      "utf8"
    );
  } catch {
    // Deduplication still works in memory when the state file cannot be written.
  }
}

export function captureClipboardNow(store: DesktopStore): ClipboardCaptureResult {
  const content = readClipboardTextOrImage();
  const result = captureClipboardContent(store, content);
  emitClipboardCaptureResult(result);
  return result;
}

function captureClipboardContent(store: DesktopStore, content: ClipboardCaptureContent): ClipboardCaptureResult {
  readPersistentDedupeState();

  if (content.kind === "empty") {
    return { captured: false, kind: "empty", reason: content.reason };
  }

  if (content.kind === "text" && shouldIgnoreText(content.value)) {
    return { captured: false, kind: "text", reason: "剪贴板文本已过滤" };
  }

  const fingerprint = getContentFingerprint(content);
  if (isDuplicateRecent(fingerprint)) {
    return { captured: false, kind: content.kind, reason: "10 秒内重复内容，已跳过" };
  }

  try {
    const targetBoxId = getRecentStagingBoxId(store);
    const snapshot =
      content.kind === "image"
        ? targetBoxId == null
          ? store.captureImageData(content.value, content.title)
          : store.captureImageDataIntoBox(content.value, content.title, targetBoxId)
        : targetBoxId == null
          ? store.captureTextOrLink(content.value)
          : store.captureTextOrLinkIntoBox(content.value, targetBoxId);

    rememberFingerprint(fingerprint);
    writePersistentDedupeState();
    return { captured: true, kind: content.kind, reason: "已收集剪贴板", snapshot };
  } catch (cause) {
    return {
      captured: false,
      kind: content.kind,
      reason: cause instanceof Error ? cause.message : "剪贴板收集失败",
    };
  }
}

export function startClipboardWatcher(store: DesktopStore) {
  if (watcherTimer) {
    return { running: true, reason: "自动监听已开启" };
  }

  const currentContent = readClipboardTextOrImage();
  watcherLastFingerprint = getContentFingerprint(currentContent);

  watcherTimer = setInterval(() => {
    const content = readClipboardTextOrImage();
    const fingerprint = getContentFingerprint(content);
    if (!fingerprint) {
      return;
    }

    if (fingerprint === watcherLastFingerprint) {
      return;
    }

    watcherLastFingerprint = fingerprint;
    const result = captureClipboardContent(store, content);
    emitClipboardCaptureResult(result);
    if (!result.captured && result.reason && !result.reason.includes("重复") && result.reason !== "剪贴板为空") {
      console.info(`[clipboard-capture] ${result.reason}`);
    }
  }, 1500);

  return { running: true, reason: "自动监听已开启" };
}

export function stopClipboardWatcher() {
  if (watcherTimer) {
    clearInterval(watcherTimer);
    watcherTimer = null;
  }
  watcherLastFingerprint = "";

  return { running: false, reason: "自动监听已关闭" };
}

export function isClipboardWatcherRunning() {
  return watcherTimer != null;
}
