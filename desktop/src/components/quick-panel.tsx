import type { Item } from "../shared/types";

type QuickPanelProps = {
  items: Item[];
  open: boolean;
};

export function QuickPanel({ items, open }: QuickPanelProps) {
  return (
    <aside className={open ? "quick-panel open" : "quick-panel"} aria-label="Quick Panel">
      <div className="panel-header">
        <p className="eyebrow">Quick Panel</p>
        <h2>Recent</h2>
      </div>

      <div className="quick-list">
        {items.slice(0, 5).map((item) => (
          <article key={item.id} className="quick-item">
            <span className="quick-kind">{item.kind}</span>
            <strong>{item.title}</strong>
          </article>
        ))}

        {items.length === 0 ? (
          <div className="empty-panel">
            <p>No recent items yet.</p>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
