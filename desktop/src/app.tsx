import { useEffect, useState } from "react";
import { AppShell } from "./components/app-shell";
import type { WorkbenchSnapshot } from "./shared/types";

export function App() {
  const [snapshot, setSnapshot] = useState<WorkbenchSnapshot | null>(null);

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

  if (!snapshot) {
    return <div className="app-loading">Loading Brain Desktop...</div>;
  }

  return <AppShell snapshot={snapshot} />;
}
