"""Database models."""

from __future__ import annotations

import json
from datetime import datetime

from .constants import (
    STATUS_ARCHIVED,
    STATUS_DONE,
    STATUS_INBOX,
    STATUS_TODO,
    TYPE_GROUP,
    TYPE_IMAGE,
    TYPE_LINK,
    TYPE_TEXT,
    TYPE_VIDEO,
)
from .extensions import db


class Box(db.Model):
    """主题盒子。"""

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False, unique=True)
    color = db.Column(db.String(20), default="#f97316", nullable=False)
    description = db.Column(db.String(255), default="")
    sort_order = db.Column(db.Integer, default=0, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.now, nullable=False)

    items = db.relationship("Inspiration", back_populates="box", lazy="select")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "color": self.color,
            "description": self.description or "",
            "sort_order": self.sort_order,
            "item_count": len(self.items),
            "created_at": self.created_at.strftime("%Y-%m-%d %H:%M"),
        }


class Inspiration(db.Model):
    """灵感记录模型。"""

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    content = db.Column(db.Text, default="")
    content_type = db.Column(db.String(50), default=TYPE_TEXT, nullable=False)
    file_path = db.Column(db.String(500))
    source = db.Column(db.String(200), default="")
    category = db.Column(db.String(100), default="")
    tags = db.Column(db.String(500), default="")
    status = db.Column(db.String(50), default=STATUS_INBOX, nullable=False)
    box_id = db.Column(db.Integer, db.ForeignKey("box.id"))
    is_inbox = db.Column(db.Boolean, default=True, nullable=False)
    notes = db.Column(db.Text, default="")
    children = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.now, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now, nullable=False)

    box = db.relationship("Box", back_populates="items")

    def parsed_children(self) -> list[dict]:
        if not self.children:
            return []
        try:
            return json.loads(self.children)
        except json.JSONDecodeError:
            return []

    def tag_list(self) -> list[str]:
        if not self.tags:
            return []
        return [tag.strip() for tag in self.tags.split(",") if tag.strip()]

    def place_into_box(self, box: Box) -> None:
        self.box = box
        self.box_id = box.id
        self.is_inbox = False

    def move_back_to_inbox(self) -> None:
        self.box = None
        self.box_id = None
        self.is_inbox = True

    def next_action(self) -> dict[str, str]:
        """Return a lightweight workbench hint that pulls saved inspiration back into use.

        The project used to treat each record mostly as stored content. This projection keeps
        storage unchanged, but makes every card answer: “what should I do with this next?”
        """

        if self.status == STATUS_DONE:
            return {
                "tone": "done",
                "label": "沉淀为可复用资产",
                "description": "补一句复盘或适用场景，避免它只停留在完成记录里。",
            }

        if self.status == STATUS_ARCHIVED:
            return {
                "tone": "quiet",
                "label": "保留为参考",
                "description": "已经归档。需要时从来源、标签或盒子里再召回。",
            }

        if self.status == STATUS_TODO:
            return {
                "tone": "action",
                "label": "拆成一个最小行动",
                "description": "把这条灵感改写成 15 分钟内能开始的动作，或者合并到正在推进的项目。",
            }

        if self.is_inbox:
            if self.content_type == TYPE_LINK:
                return {
                    "tone": "triage",
                    "label": "30 秒判断：要不要进入项目？",
                    "description": "打开链接，只补一句“为什么值得留下”，再放入最相关的主题盒子。",
                }
            if self.content_type in {TYPE_IMAGE, TYPE_VIDEO}:
                return {
                    "tone": "triage",
                    "label": "提炼一个可复用观察",
                    "description": "不要只存图或视频，写下它给你的视觉、产品或内容启发。",
                }
            if self.content_type == TYPE_GROUP:
                return {
                    "tone": "triage",
                    "label": "给组合命名一个方向",
                    "description": "先判断这组内容属于同一个问题、案例还是素材包，再放入盒子。",
                }
            return {
                "tone": "triage",
                "label": "补一句用途后归位",
                "description": "用一句话说明它能服务哪个项目、文章或实验，再决定要不要留下。",
            }

        if self.box_id:
            return {
                "tone": "review",
                "label": "从盒子回流到产出",
                "description": "这条已经归位。下一步是把它链接到项目、选题、原型或待办，而不是继续收藏。",
            }

        return {
            "tone": "triage",
            "label": "重新判断归属",
            "description": "确认它应该留在大口袋、进入主题盒子，还是直接删除。",
        }

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "content": self.content or "",
            "content_type": self.content_type,
            "file_path": self.file_path,
            "source": self.source or "",
            "category": self.category or "",
            "tags": self.tags or "",
            "tag_list": self.tag_list(),
            "status": self.status,
            "box_id": self.box_id,
            "box_name": self.box.name if self.box else "",
            "is_inbox": self.is_inbox,
            "next_action": self.next_action(),
            "notes": self.notes or "",
            "children": self.parsed_children(),
            "created_at": self.created_at.strftime("%Y-%m-%d %H:%M"),
            "updated_at": self.updated_at.strftime("%Y-%m-%d %H:%M"),
        }
