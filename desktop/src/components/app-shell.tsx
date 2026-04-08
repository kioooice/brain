import type { WorkbenchSnapshot } from "../shared/types";
import { BoxRail } from "./box-rail";
import { MainCanvas } from "./main-canvas";
import { QuickCapture } from "./quick-capture";
import { QuickPanel } from "./quick-panel";

type AppShellProps = {
  snapshot: WorkbenchSnapshot;
};

export function AppShell({ snapshot }: AppShellProps) {
  const selectedBoxId = snapshot.panelState.selectedBoxId ?? snapshot.boxes[0]?.id ?? null;
  const currentBox = snapshot.boxes.find((box) => box.id === selectedBoxId);
  const currentItems = snapshot.items.filter((item) => item.boxId === selectedBoxId);

  return (
    <div className="app-shell">
      <BoxRail boxes={snapshot.boxes} selectedBoxId={selectedBoxId} />
      <div className="workspace-column">
        <QuickCapture />
        <MainCanvas box={currentBox} items={currentItems} />
      </div>
      <QuickPanel items={snapshot.items} open={snapshot.panelState.quickPanelOpen} />
    </div>
  );
}
