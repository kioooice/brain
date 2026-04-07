"""Database models."""

from __future__ import annotations

import json
from datetime import datetime

from .constants import TYPE_TEXT, STATUS_INBOX
from .extensions import db


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
    notes = db.Column(db.Text, default="")
    children = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.now, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now, nullable=False)

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
            "notes": self.notes or "",
            "children": self.parsed_children(),
            "created_at": self.created_at.strftime("%Y-%m-%d %H:%M"),
            "updated_at": self.updated_at.strftime("%Y-%m-%d %H:%M"),
        }
