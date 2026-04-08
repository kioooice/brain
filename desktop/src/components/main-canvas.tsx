import type { Box, Item } from "../shared/types";

type MainCanvasProps = {
  box: Box | undefined;
  items: Item[];
};

export function MainCanvas({ box, items }: MainCanvasProps) {
  return (
    <main className="main-canvas">
      <header className="canvas-header">
        <div>
          <p className="eyebrow">Current Box</p>
          <h1>{box?.name ?? "No box selected"}</h1>
        </div>
        <p className="canvas-meta">{items.length} item{items.length === 1 ? "" : "s"}</p>
      </header>

      <section className="card-grid" aria-label="Current box items">
        {items.length === 0 ? (
          <div className="empty-state">
            <h2>Nothing here yet</h2>
            <p>Drop in links, images, or notes to start collecting inspiration.</p>
          </div>
        ) : (
          items.map((item) => (
            <article key={item.id} className={`work-card kind-${item.kind}`}>
              <div className="card-topline">
                <span className="card-kind">{item.kind}</span>
                <span className="card-id">#{item.id}</span>
              </div>
              <h2>{item.title}</h2>
              <p>{item.content || "No body text"}</p>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
