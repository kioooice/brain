import { useEffect, useState } from "react";
import { AppShell } from "./components/app-shell";
import type { WorkbenchSnapshot } from "./shared/types";

export function App() {
  const [snapshot, setSnapshot] = useState<WorkbenchSnapshot | null>(null);
  const [dropError, setDropError] = useState("");

  useEffect(() => {
    let active = true;

    window.brainDesktop.bootstrap().then((loadedSnapshot) => {
      if (active) {
        setSnapshot(loadedSnapshot);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  async function handleQuickCapture(input: string) {
    const nextSnapshot = await window.brainDesktop.captureTextOrLink(input);
    setSnapshot(nextSnapshot);

    const createdItem = nextSnapshot.items[0];
    if (createdItem?.kind !== "link" || !createdItem.sourceUrl) {
      return;
    }

    const enrichedSnapshot = await window.brainDesktop.enrichLinkTitle(
      createdItem.id,
      createdItem.sourceUrl
    );
    if (enrichedSnapshot) {
      setSnapshot(enrichedSnapshot);
    }
  }

  async function handleDroppedPaths(paths: string[]) {
    try {
      setDropError("");
      const nextSnapshot = await window.brainDesktop.captureDroppedPaths(paths);
      setSnapshot(nextSnapshot);
    } catch (cause) {
      setDropError(cause instanceof Error ? cause.message : "Drop failed");
    }
  }

  if (!snapshot) {
    return <div className="app-loading">Loading Brain Desktop...</div>;
  }

  return (
    <AppShell
      snapshot={snapshot}
      onQuickCapture={handleQuickCapture}
      onDropPaths={handleDroppedPaths}
      dropError={dropError}
    />
  );
}
