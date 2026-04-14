import { DragEvent, ReactNode, useLayoutEffect, useState } from "react";
import { resolveDroppedFilePaths } from "../dropped-file-paths";

type WorkspaceDropZoneProps = {
  children: ReactNode;
  error?: string;
  onDropPaths: (paths: string[]) => void | Promise<void>;
  onDropText?: (text: string) => void | Promise<void>;
  onDropImage?: (dataUrl: string, title: string) => void | Promise<void>;
  onPasteText?: (text: string) => void | Promise<void>;
  onPasteImage?: (dataUrl: string, title: string) => void | Promise<void>;
};

function extractPaths(dataTransfer: DataTransfer | null | undefined) {
  return resolveDroppedFilePaths(dataTransfer?.files);
}

function extractDroppedText(dataTransfer: DataTransfer | null | undefined) {
  const uriList = dataTransfer?.getData("text/uri-list")?.trim() ?? "";
  if (uriList) {
    return (
      uriList
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line && !line.startsWith("#")) ?? ""
    );
  }

  return dataTransfer?.getData("text/plain")?.trim() ?? dataTransfer?.getData("text")?.trim() ?? "";
}

function extractImageFile(clipboardData: DataTransfer | null | undefined) {
  const item = Array.from(clipboardData?.items ?? []).find(
    (entry) => entry.kind === "file" && entry.type.startsWith("image/")
  );
  return item?.getAsFile() ?? null;
}

function hasSupportedDropPayload(dataTransfer: DataTransfer | null | undefined) {
  const transferTypes = Array.from(dataTransfer?.types ?? []);
  return (
    transferTypes.includes("Files") ||
    transferTypes.includes("text/plain") ||
    transferTypes.includes("text/uri-list") ||
    transferTypes.includes("text") ||
    extractPaths(dataTransfer).length > 0 ||
    Boolean(extractDroppedText(dataTransfer)) ||
    Boolean(extractImageFile(dataTransfer))
  );
}

function shouldIgnorePasteTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable
  );
}

function shouldIgnoreDropTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(".box-rail"));
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) {
        reject(new Error("读取图片失败"));
        return;
      }
      resolve(result);
    };
    reader.readAsDataURL(file);
  });
}

export function WorkspaceDropZone({
  children,
  error = "",
  onDropPaths,
  onDropText = async () => undefined,
  onDropImage = async () => undefined,
  onPasteText = async () => undefined,
  onPasteImage = async () => undefined,
}: WorkspaceDropZoneProps) {
  const [active, setActive] = useState(false);
  const [localError, setLocalError] = useState("");
  const displayError = error || localError;

  useLayoutEffect(() => {
    function handleWindowDragOver(event: globalThis.DragEvent) {
      if (event.defaultPrevented || shouldIgnoreDropTarget(event.target) || !hasSupportedDropPayload(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
      setActive(true);
    }

    function handleWindowDragLeave(event: globalThis.DragEvent) {
      if (!event.relatedTarget) {
        setActive(false);
      }
    }

    async function handleWindowDrop(event: globalThis.DragEvent) {
      if (event.defaultPrevented || shouldIgnoreDropTarget(event.target) || !hasSupportedDropPayload(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
      setActive(false);
      setLocalError("");

      try {
        const paths = extractPaths(event.dataTransfer);
        if (paths.length) {
          await onDropPaths(paths);
          return;
        }

        const imageFile = extractImageFile(event.dataTransfer);
        if (imageFile) {
          const dataUrl = await readFileAsDataUrl(imageFile);
          await onDropImage(dataUrl, imageFile.name || "拖入图片");
          return;
        }

        const text = extractDroppedText(event.dataTransfer);
        if (text) {
          await onDropText(text);
        }
      } catch (cause) {
        setLocalError(cause instanceof Error ? cause.message : "拖放失败");
      }
    }

    async function handleWindowPaste(event: globalThis.ClipboardEvent) {
      if (event.defaultPrevented || shouldIgnorePasteTarget(event.target)) {
        return;
      }

      const imageFile = extractImageFile(event.clipboardData);
      if (imageFile) {
        event.preventDefault();
        setLocalError("");

        try {
          const dataUrl = await readFileAsDataUrl(imageFile);
          await onPasteImage(dataUrl, imageFile.name || "粘贴图片");
        } catch (cause) {
          setLocalError(cause instanceof Error ? cause.message : "粘贴失败");
        }
        return;
      }

      const text = event.clipboardData?.getData("text").trim() ?? "";
      if (!text) {
        return;
      }

      event.preventDefault();
      setLocalError("");

      try {
        await onPasteText(text);
      } catch (cause) {
        setLocalError(cause instanceof Error ? cause.message : "粘贴失败");
      }
    }

    window.addEventListener("dragover", handleWindowDragOver);
    window.addEventListener("dragleave", handleWindowDragLeave);
    window.addEventListener("drop", handleWindowDrop);
    window.addEventListener("paste", handleWindowPaste);

    return () => {
      window.removeEventListener("dragover", handleWindowDragOver);
      window.removeEventListener("dragleave", handleWindowDragLeave);
      window.removeEventListener("drop", handleWindowDrop);
      window.removeEventListener("paste", handleWindowPaste);
    };
  }, [onDropImage, onDropPaths, onDropText, onPasteImage, onPasteText]);

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    if (!hasSupportedDropPayload(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    setActive(true);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (!hasSupportedDropPayload(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    setActive(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setActive(false);
  }

  async function handleDrop(event: DragEvent<HTMLDivElement>) {
    if (!hasSupportedDropPayload(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    setActive(false);
    setLocalError("");

    try {
      const paths = extractPaths(event.dataTransfer);
      if (paths.length) {
        await onDropPaths(paths);
        return;
      }

      const imageFile = extractImageFile(event.dataTransfer);
      if (imageFile) {
        const dataUrl = await readFileAsDataUrl(imageFile);
        await onDropImage(dataUrl, imageFile.name || "拖入图片");
        return;
      }

      const text = extractDroppedText(event.dataTransfer);
      if (text) {
        await onDropText(text);
      }
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : "拖放失败");
    }
  }

  return (
    <div
      aria-label="工作区拖放区"
      className={active ? "workspace-drop-zone active" : "workspace-drop-zone"}
      data-drop-active={active ? "true" : "false"}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={(event) => void handleDrop(event)}
    >
      {displayError ? <p className="workspace-drop-error">{displayError}</p> : null}
      {children}
    </div>
  );
}
