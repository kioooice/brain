export function QuickCapture() {
  return (
    <section className="quick-capture" aria-label="Quick Capture">
      <div className="quick-capture-copy">
        <p className="eyebrow">Quick Capture</p>
        <h2>Pull fresh inspiration into the workbench</h2>
        <p>Drop screenshots, images, or files anywhere into the window</p>
      </div>

      <label className="capture-field">
        <span className="capture-label">Paste a link, note, or file hint</span>
        <input className="capture-input" type="text" placeholder="Paste a link, note, or file hint" readOnly />
      </label>
    </section>
  );
}
