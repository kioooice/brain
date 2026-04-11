export type Box = {
  id: number;
  name: string;
  color: string;
  description: string;
  sortOrder: number;
};

export type ItemKind = "text" | "link" | "image" | "file" | "bundle";

export type Item = {
  id: number;
  boxId: number;
  kind: ItemKind;
  title: string;
  content: string;
  sourceUrl: string;
  sourcePath: string;
  bundleCount: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type BundleEntry = {
  entryPath: string;
  entryKind: "file" | "folder";
  sortOrder: number;
  exists: boolean;
};

export type PanelState = {
  selectedBoxId: number | null;
  quickPanelOpen: boolean;
  simpleMode?: boolean;
  alwaysOnTop?: boolean;
};

export type WorkbenchSnapshot = {
  boxes: Box[];
  items: Item[];
  panelState: PanelState;
};
