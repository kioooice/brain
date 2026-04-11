import { FormEvent, useState } from "react";

type QuickCaptureProps = {
  activeBoxName?: string;
  onSubmit?: (input: string) => Promise<void>;
};

export function QuickCapture({
  activeBoxName = "收件箱",
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
      setError(cause instanceof Error ? cause.message : "收集失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="quick-capture" aria-label="快速收集">
      <div className="quick-capture-copy">
        <p className="eyebrow">快速收集</p>
        <h2>把新灵感收进工作台</h2>
        <p>新的文本和链接会进入 {activeBoxName}</p>
      </div>

      <form className="capture-form" onSubmit={handleSubmit}>
        <label className="capture-field">
          <span className="capture-label">粘贴链接或笔记</span>
          <input
            className="capture-input"
            type="text"
            placeholder="粘贴链接或笔记"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>

        <button className="capture-button" type="submit" disabled={submitting}>
          {submitting ? "添加中..." : "添加"}
        </button>

        {error ? <p className="capture-error">{error}</p> : null}
      </form>
    </section>
  );
}
