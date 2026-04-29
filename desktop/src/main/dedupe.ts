const RECENT_DUPLICATE_WINDOW_MS = 10_000;
const recentFingerprints = new Map<string, number>();

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function hasSensitiveUrlParameter(value: string) {
  try {
    const url = new URL(value);
    return Array.from(url.searchParams.keys()).some((key) =>
      /^(api[_-]?key|access[_-]?token|auth[_-]?token|secret|token)$/i.test(key)
    );
  } catch {
    return false;
  }
}

function normalizeUrlForFingerprint(value: string) {
  const url = new URL(value.trim());
  const removableParameters = new Set(["spm", "from", "share"]);

  for (const key of Array.from(url.searchParams.keys())) {
    if (key.toLowerCase().startsWith("utm_") || removableParameters.has(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }

  const sortedParams = Array.from(url.searchParams.entries()).sort(([leftKey, leftValue], [rightKey, rightValue]) =>
    leftKey === rightKey ? leftValue.localeCompare(rightValue) : leftKey.localeCompare(rightKey)
  );
  url.search = "";
  sortedParams.forEach(([key, value]) => url.searchParams.append(key, value));
  return url.toString();
}

export function buildFingerprint(kind: string, value: string) {
  const normalizedValue = value.trim();
  const fingerprintValue =
    kind === "text" && isHttpUrl(normalizedValue)
      ? normalizeUrlForFingerprint(normalizedValue)
      : normalizedValue.replace(/\s+/g, " ");

  return `${kind}:${fingerprintValue}`;
}

export function shouldIgnoreText(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return true;
  }

  if (isHttpUrl(trimmed)) {
    if (hasSensitiveUrlParameter(trimmed)) {
      return true;
    }
    return false;
  }

  if (trimmed.length < 8) {
    return true;
  }

  if (/^\d+$/.test(trimmed)) {
    return true;
  }

  if (/^[A-Z0-9]{4,8}$/i.test(trimmed) && /\d/.test(trimmed) && /[a-z]/i.test(trimmed)) {
    return true;
  }

  if (
    /\b(api[_-]?key|secret|token|bearer)\b/i.test(trimmed) ||
    /\b(sk|ghp|xox[baprs])-?[A-Za-z0-9_-]{20,}\b/.test(trimmed) ||
    /^[A-Fa-f0-9]{32,}$/.test(trimmed) ||
    /^[A-Za-z0-9+/=_-]{40,}$/.test(trimmed)
  ) {
    return true;
  }

  return false;
}

export function isDuplicateRecent(fingerprint: string) {
  const now = Date.now();
  const lastSeenAt = recentFingerprints.get(fingerprint);
  if (lastSeenAt == null) {
    return false;
  }

  if (now - lastSeenAt > RECENT_DUPLICATE_WINDOW_MS) {
    recentFingerprints.delete(fingerprint);
    return false;
  }

  return true;
}

export function rememberFingerprint(fingerprint: string) {
  const now = Date.now();
  recentFingerprints.set(fingerprint, now);

  for (const [entry, timestamp] of recentFingerprints.entries()) {
    if (now - timestamp > RECENT_DUPLICATE_WINDOW_MS) {
      recentFingerprints.delete(entry);
    }
  }
}
