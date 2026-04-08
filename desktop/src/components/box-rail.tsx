import type { Box } from "../shared/types";

type BoxRailProps = {
  boxes: Box[];
  selectedBoxId: number | null;
};

export function BoxRail({ boxes, selectedBoxId }: BoxRailProps) {
  return (
    <aside className="box-rail" aria-label="Boxes">
      <div className="rail-header">
        <p className="eyebrow">Boxes</p>
        <h2>Workbench</h2>
      </div>

      <div className="box-list">
        {boxes.map((box) => {
          const active = box.id === selectedBoxId;

          return (
            <button key={box.id} type="button" className={active ? "box-pill active" : "box-pill"}>
              <span className="box-swatch" style={{ backgroundColor: box.color }} />
              <span className="box-text">
                <strong>{box.name}</strong>
                <span>{box.description || "No description"}</span>
              </span>
              <span className="box-count">{String(box.sortOrder + 1).padStart(2, "0")}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
