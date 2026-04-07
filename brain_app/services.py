"""Business logic helpers."""

from __future__ import annotations

import ipaddress
import json
import re
import socket
import uuid
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

import requests
from bs4 import BeautifulSoup
from flask import current_app, request
from sqlalchemy import func, or_
from werkzeug.utils import secure_filename

from .constants import (
    ALLOWED_EXTENSIONS,
    CONTENT_TYPES,
    STATUSES,
    STATUS_INBOX,
    TYPE_GROUP,
    TYPE_IMAGE,
    TYPE_LINK,
    TYPE_TEXT,
    TYPE_VIDEO,
)
from .extensions import db
from .models import Box, Inspiration

DEFAULT_TITLE = "未命名灵感"

SOURCE_HOST_RULES = {
    "douyin.com": "抖音",
    "v.douyin.com": "抖音",
    "iesdouyin.com": "抖音",
    "github.com": "GitHub",
    "gist.github.com": "GitHub",
    "bilibili.com": "B站",
    "b23.tv": "B站",
    "xiaohongshu.com": "小红书",
    "xhslink.com": "小红书",
    "youtube.com": "YouTube",
    "youtu.be": "YouTube",
    "x.com": "X",
    "twitter.com": "X",
    "weibo.com": "微博",
    "zhihu.com": "知乎",
    "mp.weixin.qq.com": "公众号",
    "juejin.cn": "掘金",
    "producthunt.com": "Product Hunt",
    "reddit.com": "Reddit",
    "news.ycombinator.com": "Hacker News",
}

TAG_KEYWORDS = [
    ("AI", ("ai", "gpt", "llm", "agent", "模型", "智能体")),
    ("自动化", ("automation", "workflow", "zapier", "n8n", "自动化", "工作流")),
    ("产品", ("product", "saas", "增长", "用户", "需求", "产品")),
    ("开发", ("api", "python", "flask", "react", "代码", "开发", "开源")),
    ("设计", ("design", "ui", "ux", "figma", "设计", "排版")),
]

CATEGORY_KEYWORDS = {
    "开发": ("github", "api", "python", "flask", "react", "代码", "开发", "开源", "掘金"),
    "设计": ("figma", "behance", "dribbble", "设计", "ui", "ux"),
    "内容": ("公众号", "小红书", "b站", "youtube", "视频", "文章", "选题", "写作"),
    "产品": ("product", "product hunt", "增长", "用户", "需求", "产品", "saas", "工具"),
}

SOURCE_CATEGORY_HINTS = {
    "GitHub": "\u5f00\u53d1",
    "\u6398\u91d1": "\u5f00\u53d1",
    "Product Hunt": "\u4ea7\u54c1",
    "B\u7ad9": "\u5185\u5bb9",
    "\u6296\u97f3": "\u5185\u5bb9",
    "\u5c0f\u7ea2\u4e66": "\u5185\u5bb9",
    "YouTube": "\u5185\u5bb9",
    "\u77e5\u4e4e": "\u5185\u5bb9",
}


def normalize_status(status: str | None) -> str:
    return status if status in STATUSES else STATUS_INBOX


def normalize_type(content_type: str | None) -> str:
    return content_type if content_type in CONTENT_TYPES + [TYPE_GROUP] else TYPE_TEXT


def infer_content_type_from_upload(upload) -> str | None:
    if not upload or not upload.filename:
        return None

    mime_type = (getattr(upload, "mimetype", "") or "").lower()
    if mime_type.startswith("image/"):
        return TYPE_IMAGE
    if mime_type.startswith("video/"):
        return TYPE_VIDEO

    suffix = Path(upload.filename).suffix.lower()
    if suffix in {".png", ".jpg", ".jpeg", ".gif", ".webp"}:
        return TYPE_IMAGE
    if suffix in {".mp4", ".mov", ".webm", ".mkv"}:
        return TYPE_VIDEO
    return None


def save_uploaded_file(upload) -> str | None:
    if not upload or not upload.filename:
        return None

    filename = secure_filename(upload.filename)
    extension = Path(filename).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise ValueError("不支持的文件类型")

    saved_name = f"{uuid.uuid4().hex}{extension}"
    upload_dir = Path(current_app.config["UPLOAD_FOLDER"])
    upload.save(upload_dir / saved_name)
    return saved_name


def delete_uploaded_file(filename: str | None) -> None:
    if not filename:
        return

    upload_dir = Path(current_app.config["UPLOAD_FOLDER"]).resolve()
    target = (upload_dir / filename).resolve()
    if not str(target).startswith(str(upload_dir)):
        return
    if target.exists() and target.is_file():
        target.unlink()


def get_categories() -> list[str]:
    rows = (
        db.session.query(Inspiration.category)
        .filter(Inspiration.category.isnot(None), Inspiration.category != "")
        .distinct()
        .order_by(Inspiration.category.asc())
        .all()
    )
    return [row[0] for row in rows]


def get_stats() -> dict[str, int]:
    counts = {
        row[0]: row[1]
        for row in db.session.query(Inspiration.status, func.count(Inspiration.id))
        .group_by(Inspiration.status)
        .all()
    }
    stats = {"total": Inspiration.query.count()}
    for status in STATUSES:
        stats[status] = counts.get(status, 0)
    return stats


def get_boxes() -> list[Box]:
    return Box.query.order_by(Box.sort_order.asc(), Box.created_at.asc()).all()


def get_inbox_items(show_sorted: bool = False) -> list[Inspiration]:
    query = Inspiration.query.order_by(Inspiration.created_at.desc())
    if not show_sorted:
        query = query.filter(Inspiration.is_inbox.is_(True))
    return query.all()


def normalize_box_tokens(text: str) -> set[str]:
    tokens = re.split(r"[\s,，/|]+", (text or "").strip().lower())
    return {token for token in tokens if token}


def suggest_boxes_for_item(item: Inspiration, limit: int = 3) -> list[dict]:
    if not item:
        return []

    item_terms = normalize_box_tokens(" ".join([item.title or "", item.category or "", item.tags or "", item.source or ""]))
    scored_boxes: list[dict] = []

    for box in get_boxes():
        score = 0
        box_terms = normalize_box_tokens(" ".join([box.name or "", box.description or ""]))

        overlap = item_terms & box_terms
        score += len(overlap)

        if item.category and item.category in (box.name or ""):
            score += 3
        if item.category and item.category in (box.description or ""):
            score += 1

        if item.source and item.source in (box.name or ""):
            score += 1

        if score > 0:
            scored_boxes.append(
                {
                    "id": box.id,
                    "name": box.name,
                    "color": box.color,
                    "description": box.description or "",
                    "score": score,
                }
            )

    scored_boxes.sort(key=lambda box: (-box["score"], box["name"]))
    return scored_boxes[:limit]


def place_item_into_box(item: Inspiration, box_id: int) -> Inspiration:
    if not item:
        raise ValueError("灵感不存在")

    box = db.session.get(Box, box_id)
    if not box:
        raise ValueError("盒子不存在")

    item.place_into_box(box)
    db.session.commit()
    return item


def filter_items(category_filter: str, type_filter: str, status_filter: str, search: str) -> list[Inspiration]:
    query = Inspiration.query

    if category_filter:
        query = query.filter(Inspiration.category == category_filter)
    if type_filter:
        query = query.filter(Inspiration.content_type == type_filter)
    if status_filter:
        query = query.filter(Inspiration.status == status_filter)
    if search:
        like = f"%{search}%"
        query = query.filter(
            or_(
                Inspiration.title.ilike(like),
                Inspiration.content.ilike(like),
                Inspiration.tags.ilike(like),
                Inspiration.notes.ilike(like),
            )
        )

    return query.order_by(Inspiration.created_at.desc()).all()


def validate_outbound_url(url: str) -> bool:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return False

    host = parsed.hostname.lower()
    if host == "localhost" or host.endswith(".local"):
        return False

    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return True

    return not (ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved)


def clean_title(raw: str) -> str:
    title = (raw or "").replace("_bilibili_bilibili", "").replace(" - bilibili", "").strip()
    if title.lower().startswith("github - "):
        title = title[9:].strip()
    title = re.sub(r"\s+[·|]\s*github\s*$", "", title, flags=re.IGNORECASE).strip()
    for separator in ("|",):
        if separator in title:
            title = title.split(separator)[0].strip()
    return title[:100] or DEFAULT_TITLE

def extract_first_url(text: str) -> str:
    match = re.search(r"https?://[^\s<>'\"\)]+", text or "", re.IGNORECASE)
    return match.group(0).rstrip(".,!?)]}") if match else ""


def extract_first_line_url(text: str) -> str:
    first_line = (text or "").splitlines()[0].strip() if text else ""
    return extract_first_url(first_line)


def strip_tracking_text(text: str) -> str:
    cleaned = text or ""
    cleaned = re.sub(r"(?im)^\s*(?:spm[_a-z0-9-]*|utm[_a-z0-9-]*|from|share[_a-z0-9-]*)\s*=.*$", "", cleaned)
    cleaned = re.sub(r"(?i)\b(?:spm[_a-z0-9-]*|utm[_a-z0-9-]*|share[_a-z0-9-]*)=[^\s&]+", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def looks_like_url(value: str) -> bool:
    text = (value or "").strip()
    if not text:
        return False
    return bool(re.fullmatch(r"https?://[^\s]+/?", text, re.IGNORECASE))


def strip_share_instructions(text: str) -> str:
    cleaned = text or ""
    patterns = [
        r"^\s*\d+(?:\.\d+)?\s+\d{2}/\d{2}\s+[A-Za-z0-9@._-]+\s+yte:/\s*",
        r"^\s*\d+(?:\.\d+)?\s+[A-Za-z0-9]+:/\s*",
        r"^\s*[A-Za-z0-9@._-]+\s+yte:/\s*",
        r"^\s*\d{2}/\d{2}\s+",
        r"复制此链接.*$",
        r"打开抖音搜索.*$",
        r"打开Dou音搜索.*$",
        r"直接观看视频!?$",
        r"直接观看!?$",
        r"打开.*?(?:搜索|查看).*$",
    ]
    for pattern in patterns:
        cleaned = re.sub(pattern, "", cleaned, flags=re.IGNORECASE)
    return cleaned.strip()

def infer_url_fallback_title(url: str, source: str) -> str:
    if source:
        return f"{source}内容"

    parsed = urlparse(url)
    hostname = (parsed.hostname or "").lower().removeprefix("www.")
    if hostname:
        return f"{hostname} link"

    return "link"


def infer_source_from_url(url: str) -> str:
    hostname = (urlparse(url).hostname or "").lower().removeprefix("www.")
    if not hostname:
        return ""

    for rule_host, source in SOURCE_HOST_RULES.items():
        if hostname == rule_host or hostname.endswith(f".{rule_host}"):
            return source
    return hostname


def build_title_from_text(text: str) -> str:
    normalized = re.sub(r"\s+", " ", (text or "").strip())
    normalized = normalized[:100].strip(" -|:?")
    return normalized or DEFAULT_TITLE


def extract_hashtag_tags(text: str) -> list[str]:
    matches = re.findall(r"#([A-Za-z0-9_\-\u4e00-\u9fff]+)", text or "")
    result: list[str] = []
    for tag in matches:
        cleaned = tag.strip()
        if cleaned and cleaned not in result:
            result.append(cleaned)
    return result


def infer_tags(text: str, source: str) -> list[str]:
    haystack = (text or "").lower()
    tags: list[str] = extract_hashtag_tags(text)

    if source and source in {"GitHub", "B站", "小红书", "抖音", "YouTube", "知乎", "掘金", "Product Hunt"}:
        tags.append(source)

    for tag, keywords in TAG_KEYWORDS:
        if any(keyword.lower() in haystack for keyword in keywords):
            tags.append(tag)

    deduped: list[str] = []
    for tag in tags:
        if tag not in deduped:
            deduped.append(tag)
    return deduped[:5]


def infer_category(text: str, source: str) -> str:
    if source in SOURCE_CATEGORY_HINTS:
        return SOURCE_CATEGORY_HINTS[source]

    haystack = (text or "").lower()
    scores: dict[str, int] = {}
    for category, keywords in CATEGORY_KEYWORDS.items():
        score = sum(1 for keyword in keywords if keyword.lower() in haystack)
        if score > 0:
            scores[category] = score

    if not scores:
        return ""

    best_category = max(scores, key=scores.get)
    return best_category if scores[best_category] >= 2 else ""


def normalize_fetch_url(url: str) -> str:
    parsed = urlparse(url)
    if not parsed.query:
        return url

    filtered_query = [
        (key, value)
        for key, value in parse_qsl(parsed.query, keep_blank_values=True)
        if not key.lower().startswith(("spm", "utm_", "from", "share_"))
    ]

    return urlunparse(parsed._replace(query=urlencode(filtered_query, doseq=True)))


def extract_bilibili_title(url: str) -> str:
    parsed = urlparse(url)
    path = parsed.path or ""

    bvid_match = re.search(r"/video/(BV[0-9A-Za-z]+)", path)
    aid_match = re.search(r"/video/av(\d+)", path, re.IGNORECASE)

    api_url = ""
    if bvid_match:
        api_url = f"https://api.bilibili.com/x/web-interface/view?bvid={bvid_match.group(1)}"
    elif aid_match:
        api_url = f"https://api.bilibili.com/x/web-interface/view?aid={aid_match.group(1)}"

    if not api_url:
        return ""

    response = requests.get(
        api_url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            ),
            "Accept": "application/json",
        },
        timeout=8,
    )
    response.raise_for_status()

    payload = response.json() if response.headers.get("Content-Type", "").startswith("application/json") else {}
    title = ((payload.get("data") or {}).get("title") or "").strip()
    return clean_title(title) if title else ""


def extract_title_from_url(url: str) -> str:
    normalized_url = normalize_fetch_url(url)
    hostname = (urlparse(normalized_url).hostname or "").lower()

    if any(domain in hostname for domain in ("bilibili.com", "b23.tv")):
        try:
            api_title = extract_bilibili_title(normalized_url)
            if api_title:
                return api_title
        except Exception:
            pass

    response = requests.get(
        normalized_url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            ),
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        },
        timeout=8,
        allow_redirects=True,
    )
    response.raise_for_status()

    if any(domain in (urlparse(response.url).hostname or "").lower() for domain in ("bilibili.com", "b23.tv")):
        try:
            api_title = extract_bilibili_title(response.url)
            if api_title:
                return api_title
        except Exception:
            pass

    if "text/html" not in response.headers.get("Content-Type", ""):
        return normalized_url

    response.encoding = response.apparent_encoding or response.encoding or "utf-8"
    soup = BeautifulSoup(response.text, "html.parser")

    for candidate in (
        soup.find("meta", property="og:title"),
        soup.find("meta", attrs={"name": "twitter:title"}),
    ):
        if candidate and candidate.get("content"):
            return clean_title(candidate["content"])

    if soup.title and soup.title.string:
        return clean_title(soup.title.string)

    heading = soup.find("h1")
    if heading:
        return clean_title(heading.get_text(" ", strip=True))

    return normalized_url


def analyze_pasted_content(content: str) -> dict[str, str]:
    text = (content or "").strip()
    if not text:
        return {
            "title": "",
            "content_type": TYPE_TEXT,
            "source": "",
            "category": "",
            "tags": "",
            "url": "",
        }

    first_line_url = extract_first_line_url(text)
    any_url = extract_first_url(text)
    url = first_line_url or any_url
    source = infer_source_from_url(url) if url else ""

    content_type = TYPE_LINK if first_line_url else TYPE_TEXT

    title = ""
    if content_type == TYPE_LINK and url and validate_outbound_url(url):
        try:
            title = extract_title_from_url(url)
            if looks_like_url(title):
                title = ""
        except Exception:
            title = ""

    if not title:
        title_source = text
        if url:
            title_source = title_source.replace(url, " ")
        title_source = strip_share_instructions(title_source)
        title_source = strip_tracking_text(title_source)
        if not re.search(r"[A-Za-z0-9\u4e00-\u9fff]", title_source):
            title_source = ""

        if title_source:
            title = build_title_from_text(title_source)
        elif url:
            fallback = infer_url_fallback_title(url, source)
            title = fallback or build_title_from_text("")
        else:
            title = build_title_from_text("")

    # Use both pasted text and fetched title for better category/tag inference.
    inference_text = text
    if title and title not in inference_text:
        inference_text = f"{inference_text} {title}".strip()

    category = infer_category(inference_text, source)
    tags = infer_tags(inference_text, source)

    return {
        "title": title,
        "content_type": content_type,
        "source": source,
        "category": category,
        "tags": ", ".join(tags),
        "url": url,
    }


def apply_form_to_item(item: Inspiration | None = None) -> Inspiration:
    current = item or Inspiration()
    current.title = request.form.get("title", "").strip() or DEFAULT_TITLE
    current.content = request.form.get("content", "").strip()
    current.content_type = normalize_type(request.form.get("content_type"))
    current.source = request.form.get("source", "").strip()
    current.category = request.form.get("category", "").strip()
    current.tags = request.form.get("tags", "").strip()
    current.status = normalize_status(request.form.get("status"))
    current.notes = request.form.get("notes", "").strip()
    return current


def apply_json_to_item(data: dict | None, item: Inspiration | None = None) -> Inspiration:
    payload = data or {}
    current = item or Inspiration()

    current.title = (payload.get("title") or "").strip() or DEFAULT_TITLE
    current.content = (payload.get("content") or "").strip()
    current.content_type = normalize_type(payload.get("content_type"))
    current.source = (payload.get("source") or "").strip()
    current.category = (payload.get("category") or "").strip()
    current.tags = (payload.get("tags") or "").strip()
    current.status = normalize_status(payload.get("status"))
    current.notes = (payload.get("notes") or "").strip()
    return current


def merge_records(items: list[Inspiration]) -> Inspiration:
    group = Inspiration(
        title=f"灵感组合 {items[0].created_at.strftime('%m-%d %H:%M')}" if items else "灵感组合",
        content="",
        content_type=TYPE_GROUP,
        category=items[0].category if items else "",
        status=STATUS_INBOX,
        children=json.dumps([item.to_dict() for item in items], ensure_ascii=False),
    )
    db.session.add(group)
    for item in items:
        db.session.delete(item)
    db.session.commit()
    return group










