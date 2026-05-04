export const DRAG_FEEDBACK = {
  card: {
    idle: "拖到空白位置排序，拖到卡片上组合，拖到左侧盒子移动，拖到垃圾箱删除",
  },
  moveTarget: {
    panelLabel: "移动到盒子",
    panelHint: "选择目标后松开",
    idle: "拖到这里移动",
    ready: "松开移动到这里",
    moving: "正在移动...",
    error: "移动失败，卡片仍在原盒子",
  },
  trash: {
    idle: "把卡片或盒子拖到这里删除",
    itemReady: "松开删除卡片",
    boxReady: "松开删除盒子",
  },
} as const;

export const DROP_VISUAL = {
  idle: "idle",
  sort: "sort",
  group: "group",
  move: "move",
  delete: "delete",
  error: "error",
} as const;

export function getCardDragStatusText({
  targetIndex,
  targetItemName,
}: {
  targetIndex?: number | null;
  targetItemName?: string | null;
}) {
  if (targetItemName) {
    return `松开后与 ${targetItemName} 组合`;
  }

  if (targetIndex != null) {
    return `松开后移动到位置 ${targetIndex + 1}`;
  }

  return DRAG_FEEDBACK.card.idle;
}

export function getMoveTargetStatusText(status: "idle" | "ready" | "moving" | "error") {
  return DRAG_FEEDBACK.moveTarget[status];
}
