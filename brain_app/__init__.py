"""Application factory."""

from __future__ import annotations

import os
import secrets
import sqlite3
import sys
from pathlib import Path
from urllib.parse import quote

from flask import Flask, jsonify, redirect, request, session, url_for
from sqlalchemy.pool import NullPool

from .extensions import db
from .routes import bp, inject_template_globals

if getattr(sys, "frozen", False):
    APP_BASE_DIR = Path(sys.executable).resolve().parent
    RESOURCE_DIR = Path(getattr(sys, "_MEIPASS", APP_BASE_DIR))
else:
    APP_BASE_DIR = Path(__file__).resolve().parent.parent
    RESOURCE_DIR = APP_BASE_DIR

UPLOAD_DIR = APP_BASE_DIR / "uploads"
DATABASE_PATH = APP_BASE_DIR / "instance" / "inspirations.db"
TEMPLATE_DIR = RESOURCE_DIR / "templates"


def _env_flag(name: str, default: bool) -> bool:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    return raw_value.strip().lower() in {"1", "true", "yes", "on"}


def _is_api_request() -> bool:
    return (request.path or "").startswith("/api/")


def _is_safe_relative_target(target: str | None) -> bool:
    return bool(target) and target.startswith("/") and not target.startswith("//")


def _sqlite_database_path(database_uri: str) -> Path | None:
    if not database_uri.startswith("sqlite:///"):
        return None
    return Path(database_uri.removeprefix("sqlite:///"))


def _migrate_sqlite_workbench_schema(database_uri: str) -> None:
    database_path = _sqlite_database_path(database_uri)
    if not database_path or not database_path.exists():
        return

    with sqlite3.connect(database_path) as connection:
        tables = {
            row[0]
            for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        }
        if "inspiration" not in tables:
            return

        columns = {
            row[1]
            for row in connection.execute("PRAGMA table_info(inspiration)").fetchall()
        }
        if "box_id" not in columns:
            connection.execute("ALTER TABLE inspiration ADD COLUMN box_id INTEGER")
        if "is_inbox" not in columns:
            connection.execute("ALTER TABLE inspiration ADD COLUMN is_inbox BOOLEAN NOT NULL DEFAULT 1")
        connection.commit()


def create_app(test_config: dict | None = None) -> Flask:
    app = Flask(__name__, template_folder=str(TEMPLATE_DIR))
    app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{DATABASE_PATH.as_posix()}"
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {}
    app.config["UPLOAD_FOLDER"] = str(UPLOAD_DIR)
    app.config["MAX_CONTENT_LENGTH"] = 100 * 1024 * 1024
    app.config["TESTING"] = False
    app.config["SECRET_KEY"] = os.getenv("BRAIN_SECRET_KEY") or secrets.token_hex(24)
    app.config["BRAIN_PASSWORD"] = os.getenv("BRAIN_PASSWORD", "").strip()
    app.config["SESSION_COOKIE_HTTPONLY"] = True
    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
    app.config["SESSION_COOKIE_SECURE"] = _env_flag("BRAIN_SESSION_COOKIE_SECURE", not _env_flag("BRAIN_DEBUG", True))

    if test_config:
        app.config.update(test_config)

    Path(app.config["UPLOAD_FOLDER"]).mkdir(parents=True, exist_ok=True)
    database_uri = app.config["SQLALCHEMY_DATABASE_URI"]
    if database_uri.startswith("sqlite:///"):
        app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
            **app.config.get("SQLALCHEMY_ENGINE_OPTIONS", {}),
            "poolclass": NullPool,
        }
        database_path = Path(database_uri.removeprefix("sqlite:///"))
        database_path.parent.mkdir(parents=True, exist_ok=True)

    db.init_app(app)
    app.register_blueprint(bp)
    app.context_processor(inject_template_globals)

    @app.errorhandler(413)
    def too_large(_error):
        return jsonify({"success": False, "error": "文件超过 100MB 限制"}), 413

    @app.before_request
    def require_login():
        password = (app.config.get("BRAIN_PASSWORD") or "").strip()
        if not password:
            return None

        allowed_endpoints = {"main.login", "main.logout", "main.healthz", "static"}
        if request.endpoint in allowed_endpoints or session.get("authenticated"):
            return None

        if _is_api_request():
            return jsonify({"success": False, "error": "未登录"}), 401

        next_target = request.full_path if request.query_string else request.path
        login_url = url_for("main.login")
        if _is_safe_relative_target(next_target):
            login_url = f"{login_url}?next={quote(next_target, safe='/?=&')}"
        return redirect(login_url)

    with app.app_context():
        db.create_all()
        _migrate_sqlite_workbench_schema(app.config["SQLALCHEMY_DATABASE_URI"])

    return app
