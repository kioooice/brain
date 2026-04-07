"""Database models."""

from __future__ import annotations

import json
from datetime import datetime

from .constants import TYPE_TEXT, STATUS_INBOX
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
            "notes": self.notes or "",
            "children": self.parsed_children(),
            "created_at": self.created_at.strftime("%Y-%m-%d %H:%M"),
            "updated_at": self.updated_at.strftime("%Y-%m-%d %H:%M"),
        }
