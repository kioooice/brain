const SEARCH_GAP_PATTERN = /[\s\u200B-\u200D\uFEFF]+/gu;

export function normalizeSearchText(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(SEARCH_GAP_PATTERN, "");
}

export function matchesNormalizedSearch(parts: Array<string | null | undefined>, query: string) {
  const normalizedQuery = normalizeSearchText(query.trim());
  if (!normalizedQuery) {
    return true;
  }

  return normalizeSearchText(parts.filter(Boolean).join(" ")).includes(normalizedQuery);
}
