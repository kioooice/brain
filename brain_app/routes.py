"""Route registration."""

from __future__ import annotations

from flask import Blueprint, jsonify, redirect, render_template, request, send_from_directory, url_for, current_app

from .constants import CONTENT_TYPES, STATUSES, STATUS_COLORS, TYPE_GROUP, TYPE_ICONS, TYPE_TEXT
from .extensions import db
from .models import Inspiration
from .services import (
    analyze_pasted_content,
    apply_form_to_item,
    apply_json_to_item,
    delete_uploaded_file,
    extract_first_url,
    extract_title_from_url,
    filter_items,
    get_categories,
    get_stats,
    infer_content_type_from_upload,
    merge_records,
    normalize_status,
    save_uploaded_file,
    validate_outbound_url,
)

bp = Blueprint("main", __name__)


def serialize_item(item: Inspiration) -> dict:
    item_dict = item.to_dict()
    item_dict["open_url"] = extract_first_url(item_dict.get("content", ""))
    for child in item_dict.get("children", []):
        child["open_url"] = extract_first_url(child.get("content", ""))
    return item_dict


@bp.route("/")
def index():
    category_filter = request.args.get("category", "").strip()
    type_filter = request.args.get("type", "").strip()
    status_filter = request.args.get("status", "").strip()
    search = request.args.get("search", "").strip()

    items = filter_items(category_filter, type_filter, status_filter, search)
    serialized_items = [serialize_item(item) for item in items]

    return render_template(
        "index.html",
        items=serialized_items,
        categories=get_categories(),
        stats=get_stats(),
        current_category=category_filter,
        current_type=type_filter,
        current_status=status_filter,
        search=search,
    )


@bp.route("/add", methods=["GET", "POST"])
def add_item():
    if request.method == "POST":
        item = apply_form_to_item()
        file = request.files.get("file")
        try:
            item.file_path = save_uploaded_file(file)
            if file and file.filename and item.content_type == "文字":
                inferred_type = infer_content_type_from_upload(file)
                if inferred_type:
                    item.content_type = inferred_type
        except ValueError as exc:
            return render_template("add.html", item=item.to_dict(), categories=get_categories(), error=str(exc)), 400
        db.session.add(item)
        db.session.commit()
        return redirect(url_for("main.index"))

    return render_template("add.html", item=None, categories=get_categories(), error="")


@bp.route("/edit/<int:item_id>", methods=["GET", "POST"])
def edit_item(item_id: int):
    item = db.session.get(Inspiration, item_id)
    if not item:
        return redirect(url_for("main.index"))

    if request.method == "POST":
        item = apply_form_to_item(item)
        uploaded = request.files.get("file")
        if uploaded and uploaded.filename:
            old_file = item.file_path
            try:
                item.file_path = save_uploaded_file(uploaded)
                if item.content_type == "文字":
                    inferred_type = infer_content_type_from_upload(uploaded)
                    if inferred_type:
                        item.content_type = inferred_type
            except ValueError as exc:
                return render_template("edit.html", item=item, categories=get_categories(), error=str(exc)), 400
            delete_uploaded_file(old_file)
        db.session.commit()
        return redirect(url_for("main.index"))

    return render_template("edit.html", item=item, categories=get_categories(), error="")


@bp.route("/delete/<int:item_id>", methods=["POST"])
def delete_item(item_id: int):
    item = db.session.get(Inspiration, item_id)
    if not item:
        return jsonify({"success": False, "error": "记录不存在"}), 404

    delete_uploaded_file(item.file_path)
    db.session.delete(item)
    db.session.commit()
    return jsonify({"success": True})


@bp.route("/uploads/<path:filename>")
def uploaded_file(filename: str):
    return send_from_directory(current_app.config["UPLOAD_FOLDER"], filename)


@bp.route("/api/fetch-title")
def fetch_title():
    url = request.args.get("url", "").strip()
    if not url:
        return jsonify({"success": False, "error": "缺少 URL"}), 400
    if not validate_outbound_url(url):
        return jsonify({"success": False, "error": "URL 不合法或不允许访问"}), 400

    try:
        return jsonify({"success": True, "title": extract_title_from_url(url)})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc), "title": url}), 502


@bp.route("/api/analyze-paste", methods=["POST"])
def analyze_paste():
    data = request.get_json(silent=True) or {}
    content = data.get("content", "").strip()
    if not content:
        return jsonify({"success": False, "error": "缺少内容"}), 400

    suggestion = analyze_pasted_content(content)
    return jsonify({"success": True, **suggestion})


@bp.route("/api/add", methods=["POST"])
def api_add():
    item = apply_form_to_item()
    file = request.files.get("file")
    try:
        item.file_path = save_uploaded_file(file)
        if file and file.filename and item.content_type == "文字":
            inferred_type = infer_content_type_from_upload(file)
            if inferred_type:
                item.content_type = inferred_type
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400

    db.session.add(item)
    db.session.commit()
    return jsonify({"success": True, "id": item.id})


@bp.route("/api/edit/<int:item_id>", methods=["PUT"])
def api_edit(item_id: int):
    item = db.session.get(Inspiration, item_id)
    if not item:
        return jsonify({"success": False, "error": "记录不存在"}), 404

    data = request.get_json(silent=True) or {}
    item.title = data.get("title", item.title).strip() or item.title
    item.content = data.get("content", item.content)
    item.category = data.get("category", item.category).strip()
    item.source = data.get("source", item.source).strip()
    item.tags = data.get("tags", item.tags).strip()
    item.notes = data.get("notes", item.notes)
    item.status = normalize_status(data.get("status", item.status))
    db.session.commit()
    return jsonify({"success": True, "item": item.to_dict()})


@bp.route("/api/status/<int:item_id>", methods=["PUT"])
def update_status(item_id: int):
    item = db.session.get(Inspiration, item_id)
    if not item:
        return jsonify({"success": False, "error": "记录不存在"}), 404

    data = request.get_json(silent=True) or {}
    item.status = normalize_status(data.get("status"))
    db.session.commit()
    return jsonify({"success": True, "status": item.status})


@bp.route("/api/batch-delete", methods=["POST"])
def batch_delete():
    data = request.get_json(silent=True) or {}
    ids = data.get("ids", [])
    if not isinstance(ids, list):
        return jsonify({"success": False, "error": "ids 必须是数组"}), 400

    deleted = 0
    for item_id in ids:
        item = db.session.get(Inspiration, item_id)
        if not item:
            continue
        delete_uploaded_file(item.file_path)
        db.session.delete(item)
        deleted += 1

    db.session.commit()
    return jsonify({"success": True, "deleted": deleted})


@bp.route("/api/merge", methods=["POST"])
def merge_items():
    data = request.get_json(silent=True) or {}
    ids = data.get("ids", [])
    if not isinstance(ids, list) or len(ids) < 2:
        return jsonify({"success": False, "error": "至少选择两条记录"}), 400

    items = [db.session.get(Inspiration, item_id) for item_id in ids]
    items = [item for item in items if item]
    if len(items) < 2:
        return jsonify({"success": False, "error": "可合并记录不足"}), 400

    group = merge_records(items)
    return jsonify({"success": True, "id": group.id})


@bp.route("/api/unmerge/<int:item_id>", methods=["POST"])
def unmerge_item(item_id: int):
    item = db.session.get(Inspiration, item_id)
    if not item:
        return jsonify({"success": False, "error": "记录不存在"}), 404
    if item.content_type != TYPE_GROUP:
        return jsonify({"success": False, "error": "该记录不是组合灵感"}), 400

    children = item.parsed_children()
    if not children:
        return jsonify({"success": False, "error": "组合里没有可恢复的子记录"}), 400

    restored = 0
    for child in children:
        restored_item = Inspiration(
            title=(child.get("title") or "未命名灵感").strip(),
            content=(child.get("content") or "").strip(),
            content_type=(child.get("content_type") or TYPE_TEXT).strip() or TYPE_TEXT,
            file_path=(child.get("file_path") or None),
            source=(child.get("source") or "").strip(),
            category=(child.get("category") or "").strip(),
            tags=(child.get("tags") or "").strip(),
            status=normalize_status(child.get("status")),
            notes=(child.get("notes") or "").strip(),
        )
        db.session.add(restored_item)
        restored += 1

    db.session.delete(item)
    db.session.commit()
    return jsonify({"success": True, "restored": restored})


@bp.route("/api/items")
def api_items():
    items = Inspiration.query.order_by(Inspiration.created_at.desc()).all()
    return jsonify([serialize_item(item) for item in items])


@bp.route("/api/meta")
def api_meta():
    return jsonify(
        {
            "statuses": STATUSES,
            "content_types": CONTENT_TYPES,
            "categories": get_categories(),
        }
    )


@bp.route("/api/items/<int:item_id>")
def api_item_detail(item_id: int):
    item = db.session.get(Inspiration, item_id)
    if not item:
        return jsonify({"success": False, "error": "记录不存在"}), 404
    return jsonify({"success": True, "item": serialize_item(item)})


@bp.route("/api/items", methods=["POST"])
def api_create_item():
    data = request.get_json(silent=True) or {}
    item = apply_json_to_item(data)
    db.session.add(item)
    db.session.commit()
    return jsonify({"success": True, "item": serialize_item(item)}), 201


@bp.route("/api/items/<int:item_id>", methods=["PUT"])
def api_update_item(item_id: int):
    item = db.session.get(Inspiration, item_id)
    if not item:
        return jsonify({"success": False, "error": "记录不存在"}), 404

    data = request.get_json(silent=True) or {}
    payload = {
        "title": data.get("title", item.title),
        "content": data.get("content", item.content),
        "content_type": data.get("content_type", item.content_type),
        "source": data.get("source", item.source),
        "category": data.get("category", item.category),
        "tags": data.get("tags", item.tags),
        "status": data.get("status", item.status),
        "notes": data.get("notes", item.notes),
    }
    apply_json_to_item(payload, item)
    db.session.commit()
    return jsonify({"success": True, "item": serialize_item(item)})


@bp.route("/api/items/<int:item_id>", methods=["DELETE"])
def api_delete_item(item_id: int):
    item = db.session.get(Inspiration, item_id)
    if not item:
        return jsonify({"success": False, "error": "记录不存在"}), 404

    delete_uploaded_file(item.file_path)
    db.session.delete(item)
    db.session.commit()
    return jsonify({"success": True})


def inject_template_globals():
    return {
        "statuses": STATUSES,
        "status_colors": STATUS_COLORS,
        "content_types": CONTENT_TYPES,
        "type_icons": TYPE_ICONS,
    }
