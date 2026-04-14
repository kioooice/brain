type FileLike = File & {
  path?: string;
};

export function resolveDroppedFilePaths(files: FileList | File[] | null | undefined) {
  const fileList = Array.from(files ?? []);
  if (fileList.length === 0) {
    return [];
  }

  const directPaths = fileList.map((file) => ((file as FileLike).path ?? "").trim());
  if (directPaths.every(Boolean)) {
    return directPaths;
  }

  const bridgedPaths = window.brainDesktop?.getPathsForFiles?.(fileList) ?? [];
  return directPaths
    .map((path, index) => path || bridgedPaths[index]?.trim() || "")
    .filter((path) => path.length > 0);
}
