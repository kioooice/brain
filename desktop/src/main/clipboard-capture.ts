import { clipboard } from "electron";
import type { WorkbenchSnapshot } from "../shared/types";
import { buildFingerprint, isDuplicateRecent, rememberFingerprint, shouldIgnoreText } from "./dedupe";
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

let watcherTimer: ReturnType<typeof setInterval> | null = null;
let captureTargetBoxId: number | null = null;
let watcherLastFingerprint = "";

export function setClipboardCaptureBoxId(boxId: number | null) {
  captureTargetBoxId = boxId;
}

export function getClipboardCaptureBoxId() {
  return captureTargetBoxId;
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

export function captureClipboardNow(store: DesktopStore): ClipboardCaptureResult {
  const content = readClipboardTextOrImage();
  return captureClipboardContent(store, content);
}

function captureClipboardContent(store: DesktopStore, content: ClipboardCaptureContent): ClipboardCaptureResult {
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
    const snapshot =
      content.kind === "image"
        ? captureTargetBoxId == null
          ? store.captureImageData(content.value, content.title)
          : store.captureImageDataIntoBox(content.value, content.title, captureTargetBoxId)
        : captureTargetBoxId == null
          ? store.captureTextOrLink(content.value)
          : store.captureTextOrLinkIntoBox(content.value, captureTargetBoxId);

    rememberFingerprint(fingerprint);
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
      watcherLastFingerprint = "";
      return;
    }

    if (fingerprint === watcherLastFingerprint) {
      return;
    }

    watcherLastFingerprint = fingerprint;
    const result = captureClipboardContent(store, content);
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
