import { describe, expect, it } from "vitest";
import { redactSensitiveText } from "./sensitive-redaction";

describe("redactSensitiveText", () => {
  it("redacts explicit secrets and common authorization tokens", () => {
    const message =
      "DeepSeek failed with Bearer sk-local-abcdef and api_key=sk-other-secret-token";

    const redacted = redactSensitiveText(message, ["sk-local-abcdef"]);

    expect(redacted).not.toContain("sk-local-abcdef");
    expect(redacted).not.toContain("sk-other-secret-token");
    expect(redacted).toContain("[redacted-secret]");
  });
});
