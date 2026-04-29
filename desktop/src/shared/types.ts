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
  bundleParentId?: number | null;
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

export type BundleMemberItem = Item;

export type WindowBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SimpleModeView = "ball" | "panel" | "box";

export type PanelState = {
  selectedBoxId: number | null;
  quickPanelOpen: boolean;
  simpleMode?: boolean;
  alwaysOnTop?: boolean;
  simpleModeView?: SimpleModeView;
  floatingBallBounds?: WindowBounds | null;
};

export type WorkbenchSnapshot = {
  boxes: Box[];
  items: Item[];
  panelState: PanelState;
};
