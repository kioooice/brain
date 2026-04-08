import { DragEvent, ReactNode, useState } from "react";

type WorkspaceDropZoneProps = {
  children: ReactNode;
  error?: string;
  onDropPaths: (paths: string[]) => void | Promise<void>;
};

type FileLike = {
  path?: string;
};

function extractPaths(event: DragEvent<HTMLDivElement>) {
  const files = Array.from(event.dataTransfer?.files ?? []);
  return files
    .map((file) => (file as FileLike).path ?? "")
    .filter((path) => path.trim().length > 0);
}

export function WorkspaceDropZone({ children, error = "", onDropPaths }: WorkspaceDropZoneProps) {
  const [active, setActive] = useState(false);
  const [localError, setLocalError] = useState("");
  const displayError = error || localError;

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setActive(true);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setActive(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setActive(false);
  }

  async function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setActive(false);

    const paths = extractPaths(event);
    if (!paths.length) {
      return;
    }

    setLocalError("");
    try {
      await onDropPaths(paths);
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : "Drop failed");
    }
  }

  return (
    <div
      aria-label="Workspace Drop Zone"
      className={active ? "workspace-drop-zone active" : "workspace-drop-zone"}
      data-drop-active={active ? "true" : "false"}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {displayError ? <p className="workspace-drop-error">{displayError}</p> : null}
      {children}
    </div>
  );
}
