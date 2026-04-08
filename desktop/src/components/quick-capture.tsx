import { FormEvent, useState } from "react";

type QuickCaptureProps = {
  activeBoxName?: string;
  onSubmit?: (input: string) => Promise<void>;
};

export function QuickCapture({
  activeBoxName = "Inbox",
  onSubmit = async () => undefined,
}: QuickCaptureProps = {}) {
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = value.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    setError("");

    try {
      await onSubmit(trimmed);
      setValue("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Capture failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="quick-capture" aria-label="Quick Capture">
      <div className="quick-capture-copy">
        <p className="eyebrow">Quick Capture</p>
        <h2>Pull fresh inspiration into the workbench</h2>
        <p>New text and links will go into {activeBoxName}</p>
      </div>

      <form className="capture-form" onSubmit={handleSubmit}>
        <label className="capture-field">
          <span className="capture-label">Paste a link or note</span>
          <input
            className="capture-input"
            type="text"
            placeholder="Paste a link or note"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>

        <button className="capture-button" type="submit" disabled={submitting}>
          {submitting ? "Adding..." : "Add"}
        </button>

        {error ? <p className="capture-error">{error}</p> : null}
      </form>
    </section>
  );
}
