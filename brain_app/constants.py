"""Application-wide constants."""

STATUS_INBOX = "\u5f85\u6574\u7406"
STATUS_TODO = "\u5f85\u5b9e\u73b0"
STATUS_DONE = "\u5df2\u5b9e\u73b0"
STATUS_ARCHIVED = "\u5df2\u5f52\u6863"

TYPE_TEXT = "\u6587\u5b57"
TYPE_LINK = "\u94fe\u63a5"
TYPE_IMAGE = "\u56fe\u7247"
TYPE_VIDEO = "\u89c6\u9891"
TYPE_GROUP = "\u7ec4\u5408"

STATUSES = [STATUS_INBOX, STATUS_TODO, STATUS_DONE, STATUS_ARCHIVED]
STATUS_COLORS = {
    STATUS_INBOX: "#64748B",
    STATUS_TODO: "#2563EB",
    STATUS_DONE: "#16A34A",
    STATUS_ARCHIVED: "#D97706",
}

CONTENT_TYPES = [TYPE_TEXT, TYPE_LINK, TYPE_IMAGE, TYPE_VIDEO]
TYPE_ICONS = {
    TYPE_TEXT: "T",
    TYPE_LINK: "L",
    TYPE_IMAGE: "I",
    TYPE_VIDEO: "V",
    TYPE_GROUP: "G",
}

ALLOWED_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".mp4",
    ".mov",
    ".webm",
    ".mkv",
}
