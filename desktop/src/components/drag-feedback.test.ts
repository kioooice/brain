import { describe, expect, it } from "vitest";
import { DRAG_FEEDBACK, DROP_VISUAL, getCardDragStatusText, getMoveTargetStatusText } from "./drag-feedback";

describe("drag feedback copy", () => {
  it("keeps the idle card drag guidance aligned across sort, group, move, and delete", () => {
    expect(getCardDragStatusText({})).toBe(DRAG_FEEDBACK.card.idle);
    expect(DRAG_FEEDBACK.card.idle).toContain("拖到空白位置排序");
    expect(DRAG_FEEDBACK.card.idle).toContain("拖到卡片上组合");
    expect(DRAG_FEEDBACK.card.idle).toContain("拖到左侧盒子移动");
    expect(DRAG_FEEDBACK.card.idle).toContain("拖到垃圾箱删除");
  });

  it("builds release text for each drag target state from the same vocabulary", () => {
    expect(getCardDragStatusText({ targetIndex: 0 })).toBe("松开后移动到位置 1");
    expect(getCardDragStatusText({ targetItemName: "Target note" })).toBe("松开后与 Target note 组合");
    expect(getMoveTargetStatusText("ready")).toBe("松开移动到这里");
    expect(getMoveTargetStatusText("moving")).toBe("正在移动...");
    expect(getMoveTargetStatusText("error")).toBe("移动失败，卡片仍在原盒子");
  });

  it("defines the shared visual variants used by every drag target", () => {
    expect(DROP_VISUAL).toEqual({
      idle: "idle",
      sort: "sort",
      group: "group",
      move: "move",
      delete: "delete",
      error: "error",
    });
  });
});
