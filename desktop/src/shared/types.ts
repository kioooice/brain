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
};

export type PanelState = {
  selectedBoxId: number | null;
  quickPanelOpen: boolean;
};

export type WorkbenchSnapshot = {
  boxes: Box[];
  items: Item[];
  panelState: PanelState;
};
