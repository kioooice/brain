import gc
import sqlite3
import tempfile
import time
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

from brain_app import create_app
from brain_app.extensions import db
from brain_app.models import Box, Inspiration
from brain_app.services import (
    extract_title_from_url,
    get_boxes,
    get_inbox_items,
    place_item_into_box,
    suggest_boxes_for_item,
    move_box,
    update_box,
)
from brain_app.constants import STATUS_DONE, STATUS_INBOX, STATUS_TODO, TYPE_IMAGE, TYPE_LINK, TYPE_TEXT

CATEGORY_PRODUCT = "产品"
CATEGORY_DEV = "开发"
APP_TITLE = "灵感收集"
TEXT_INPUT = "做一个 AI 自动化 工作流工具"
TAG_AUTOMATION = "自动化"


class TestAppCase(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        temp_root = Path(self.temp_dir.name)
        self.db_path = temp_root / "instance" / "test.db"
        self.upload_dir = temp_root / "uploads"

        self.app = create_app(
            {
                "TESTING": True,
                "SQLALCHEMY_DATABASE_URI": f"sqlite:///{self.db_path.as_posix()}",
                "UPLOAD_FOLDER": str(self.upload_dir),
            }
        )
        self.client = self.app.test_client()

        with self.app.app_context():
            db.drop_all()
            db.create_all()
            first = Inspiration(
                title="Alpha idea",
                content="https://example.com/alpha",
                content_type=TYPE_LINK,
                source="GitHub",
                category=CATEGORY_PRODUCT,
                tags="ai,tools",
                status=STATUS_INBOX,
            )
            second = Inspiration(
                title="Beta note",
                content="ship a small feature",
                content_type=TYPE_TEXT,
                source="Notebook",
                category=CATEGORY_DEV,
                tags="draft",
                status=STATUS_TODO,
            )
            db.session.add_all([first, second])
            db.session.commit()
            self.first_id = first.id
            self.second_id = second.id

    def tearDown(self):
        with self.app.app_context():
            db.session.remove()
            db.drop_all()
            db.engine.dispose()
        self.client = None
        self.app = None
        for _ in range(3):
            try:
                self.temp_dir.cleanup()
                break
            except (PermissionError, NotADirectoryError):
                gc.collect()
                time.sleep(0.05)

    def test_index_page_renders(self):
        response = self.client.get("/")

        self.assertEqual(response.status_code, 200)
        html = response.get_data(as_text=True)
        self.assertIn(APP_TITLE, html)
        self.assertIn("Alpha idea", html)

    def test_index_renders_workbench_sections_and_actions(self):
        with self.app.app_context():
            box = Box(name="产品灵感", color="#f97316", description="收纳产品方向内容")
            db.session.add(box)
            db.session.commit()

        response = self.client.get("/")

        self.assertEqual(response.status_code, 200)
        html = response.get_data(as_text=True)
        self.assertIn("未整理", html)
        self.assertIn("主题盒子", html)
        self.assertIn("一键放入", html)
        self.assertIn("新建盒子", html)

    def test_create_box_api_creates_new_box(self):
        response = self.client.post(
            "/api/boxes",
            json={
                "name": "设计参考",
                "color": "#2563eb",
                "description": "收纳视觉和界面方向",
            },
        )

        self.assertEqual(response.status_code, 201)
        payload = response.get_json()
        self.assertTrue(payload["success"])
        self.assertEqual(payload["box"]["name"], "设计参考")

        with self.app.app_context():
            box = Box.query.filter_by(name="设计参考").first()
            self.assertIsNotNone(box)
            self.assertEqual(box.color, "#2563eb")

    def test_create_box_api_rejects_blank_name(self):
        response = self.client.post("/api/boxes", json={"name": "   "})

        self.assertEqual(response.status_code, 400)
        payload = response.get_json()
        self.assertFalse(payload["success"])

    def test_update_box_updates_name_color_and_description(self):
        with self.app.app_context():
            box = Box(name="产品灵感", color="#f97316", description="旧描述", sort_order=1)
            db.session.add(box)
            db.session.commit()

            updated = update_box(
                box.id,
                name="设计参考",
                color="#2563eb",
                description="新的说明",
            )

            self.assertEqual(updated.name, "设计参考")
            self.assertEqual(updated.color, "#2563eb")
            self.assertEqual(updated.description, "新的说明")

    def test_update_box_rejects_blank_or_duplicate_name(self):
        with self.app.app_context():
            first = Box(name="产品灵感", color="#f97316", sort_order=1)
            second = Box(name="设计参考", color="#2563eb", sort_order=2)
            db.session.add_all([first, second])
            db.session.commit()

            with self.assertRaisesRegex(ValueError, "盒子名称不能为空"):
                update_box(first.id, name="   ", color="#f97316", description="")

            with self.assertRaisesRegex(ValueError, "盒子名称已存在"):
                update_box(first.id, name="设计参考", color="#f97316", description="")

    def test_move_box_swaps_sort_order_with_adjacent_box(self):
        with self.app.app_context():
            first = Box(name="收集", color="#f97316", sort_order=1)
            second = Box(name="设计参考", color="#2563eb", sort_order=2)
            third = Box(name="实现想法", color="#22c55e", sort_order=3)
            db.session.add_all([first, second, third])
            db.session.commit()

            move_box(second.id, "up")
            self.assertEqual([box.name for box in get_boxes()], ["设计参考", "收集", "实现想法"])

            move_box(second.id, "down")
            self.assertEqual([box.name for box in get_boxes()], ["收集", "设计参考", "实现想法"])

    def test_move_box_rejects_invalid_and_out_of_range_moves(self):
        with self.app.app_context():
            first = Box(name="收集", color="#f97316", sort_order=1)
            second = Box(name="设计参考", color="#2563eb", sort_order=2)
            db.session.add_all([first, second])
            db.session.commit()

            with self.assertRaisesRegex(ValueError, "无效的移动方向"):
                move_box(first.id, "left")

            with self.assertRaisesRegex(ValueError, "已经在最上面"):
                move_box(first.id, "up")

            with self.assertRaisesRegex(ValueError, "已经在最下面"):
                move_box(second.id, "down")

    def test_open_box_shows_box_contents_on_index(self):
        with self.app.app_context():
            box = Box(name="设计参考", color="#2563eb")
            db.session.add(box)
            db.session.commit()
            box_id = box.id

            first = db.session.get(Inspiration, self.first_id)
            first.place_into_box(box)
            db.session.commit()

        response = self.client.get(f"/?box_id={box_id}&show_sorted=1")

        self.assertEqual(response.status_code, 200)
        html = response.get_data(as_text=True)
        self.assertIn("设计参考", html)
        self.assertIn("盒子内容", html)
        self.assertIn("Alpha idea", html)
        self.assertNotIn("Beta note", html)
        self.assertIn('class="btn move-back-btn"', html)
        self.assertIn(f'data-item-id="{self.first_id}"', html)

    def test_open_box_exposes_previous_and_next_box_links(self):
        with self.app.app_context():
            first_box = Box(name="收集", color="#f97316", sort_order=1)
            second_box = Box(name="设计参考", color="#2563eb", sort_order=2)
            third_box = Box(name="实现想法", color="#22c55e", sort_order=3)
            db.session.add_all([first_box, second_box, third_box])
            db.session.commit()
            first_box_id = first_box.id
            second_box_id = second_box.id
            third_box_id = third_box.id

        response = self.client.get(f"/?box_id={second_box_id}&show_sorted=1")

        self.assertEqual(response.status_code, 200)
        html = response.get_data(as_text=True)
        self.assertIn("上一个盒子", html)
        self.assertIn("下一个盒子", html)
        self.assertIn(f'href="/?box_id={first_box_id}&amp;show_sorted=1"', html)
        self.assertIn(f'href="/?box_id={third_box_id}&amp;show_sorted=1"', html)

    def test_items_api_returns_seeded_data(self):
        response = self.client.get("/api/items")

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(len(data), 2)
        titles = {item["title"] for item in data}
        self.assertEqual(titles, {"Alpha idea", "Beta note"})

    def test_search_filter_limits_results(self):
        response = self.client.get("/?search=Alpha")

        self.assertEqual(response.status_code, 200)
        html = response.get_data(as_text=True)
        self.assertIn("Alpha idea", html)
        self.assertNotIn("Beta note", html)

    def test_update_status_api_persists_change(self):
        response = self.client.put(
            f"/api/status/{self.first_id}",
            json={"status": STATUS_DONE},
        )

        self.assertEqual(response.status_code, 200)
        with self.app.app_context():
            item = db.session.get(Inspiration, self.first_id)
            self.assertEqual(item.status, STATUS_DONE)

    def test_item_can_be_placed_into_box_and_serializes_box_state(self):
        with self.app.app_context():
            box = Box(name="产品灵感", color="#f97316")
            db.session.add(box)
            db.session.commit()

            item = db.session.get(Inspiration, self.first_id)
            item.place_into_box(box)
            db.session.commit()

            item_dict = item.to_dict()
            self.assertEqual(item.box_id, box.id)
            self.assertFalse(item.is_inbox)
            self.assertEqual(item.box.name, "产品灵感")
            self.assertEqual(item_dict["box_id"], box.id)
            self.assertEqual(item_dict["box_name"], "产品灵感")
            self.assertFalse(item_dict["is_inbox"])

    def test_suggest_boxes_prefers_matching_category_and_tags(self):
        with self.app.app_context():
            product_box = Box(name="产品灵感", color="#f97316", description="产品方向")
            design_box = Box(name="设计参考", color="#2563eb", description="界面")
            db.session.add_all([product_box, design_box])
            db.session.commit()

            item = Inspiration(
                title="AI 产品首页拆解",
                content="Landing page inspiration",
                category="产品",
                tags="AI, 产品, 设计",
            )
            db.session.add(item)
            db.session.commit()

            suggestions = suggest_boxes_for_item(item)

            self.assertGreaterEqual(len(suggestions), 1)
            self.assertEqual(suggestions[0]["name"], "产品灵感")
            self.assertLessEqual(len(suggestions), 3)

    def test_get_inbox_items_excludes_sorted_items_by_default(self):
        with self.app.app_context():
            box = Box(name="内容选题", color="#22c55e")
            db.session.add(box)
            db.session.commit()

            item = db.session.get(Inspiration, self.first_id)
            place_item_into_box(item, box.id)

            inbox_items = get_inbox_items()
            all_items = get_inbox_items(show_sorted=True)

            self.assertEqual([record.id for record in inbox_items], [self.second_id])
            self.assertEqual({record.id for record in all_items}, {self.first_id, self.second_id})

    def test_index_exposes_box_and_inbox_data(self):
        with self.app.app_context():
            box = Box(name="产品灵感", color="#f97316")
            db.session.add(box)
            db.session.commit()

        with patch("brain_app.routes.render_template", return_value="ok") as render_template:
            response = self.client.get("/")

        self.assertEqual(response.status_code, 200)
        context = render_template.call_args.kwargs
        self.assertIn("boxes", context)
        self.assertIn("inbox_items", context)
        self.assertIn("show_sorted", context)
        self.assertEqual(context["boxes"][0]["name"], "产品灵感")
        self.assertEqual([item["id"] for item in context["inbox_items"]], [self.first_id, self.second_id])

    def test_place_item_into_box_api_moves_item_out_of_inbox(self):
        with self.app.app_context():
            box = Box(name="内容选题", color="#22c55e")
            db.session.add(box)
            db.session.commit()
            box_id = box.id

        response = self.client.post(
            f"/api/items/{self.first_id}/place",
            json={"box_id": box_id},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["success"])
        self.assertEqual(payload["item"]["box_id"], box_id)
        self.assertFalse(payload["item"]["is_inbox"])

        with self.app.app_context():
            item = db.session.get(Inspiration, self.first_id)
            self.assertEqual(item.box_id, box_id)
            self.assertFalse(item.is_inbox)

    def test_move_item_back_to_inbox_api_clears_box_state(self):
        with self.app.app_context():
            box = Box(name="设计参考", color="#2563eb")
            db.session.add(box)
            db.session.commit()
            item = db.session.get(Inspiration, self.first_id)
            item.place_into_box(box)
            db.session.commit()

        response = self.client.post(f"/api/items/{self.first_id}/move-back")

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["success"])
        self.assertTrue(payload["item"]["is_inbox"])
        self.assertEqual(payload["item"]["box_id"], None)

        with self.app.app_context():
            item = db.session.get(Inspiration, self.first_id)
            self.assertTrue(item.is_inbox)
            self.assertIsNone(item.box_id)

    def test_bundle_card_shows_child_preview_hints(self):
        merge_response = self.client.post(
            "/api/merge",
            json={"ids": [self.first_id, self.second_id]},
        )
        self.assertEqual(merge_response.status_code, 200)

        response = self.client.get("/?show_sorted=1")
        self.assertEqual(response.status_code, 200)
        html = response.get_data(as_text=True)
        self.assertIn("文件夹内容包", html)
        self.assertIn("内含 2 项", html)
        self.assertIn("Alpha idea", html)
        self.assertIn("Beta note", html)

    def test_index_survives_suggestion_failure(self):
        with patch("brain_app.routes.suggest_boxes_for_item", side_effect=RuntimeError("boom")):
            response = self.client.get("/")

        self.assertEqual(response.status_code, 200)
        html = response.get_data(as_text=True)
        self.assertIn("未整理", html)

    def test_batch_delete_removes_records(self):
        response = self.client.post(
            "/api/batch-delete",
            json={"ids": [self.first_id]},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["deleted"], 1)
        with self.app.app_context():
            self.assertIsNone(db.session.get(Inspiration, self.first_id))
            self.assertIsNotNone(db.session.get(Inspiration, self.second_id))

    def test_merge_creates_group_record(self):
        response = self.client.post(
            "/api/merge",
            json={"ids": [self.first_id, self.second_id]},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["id"] > 0)

        with self.app.app_context():
            items = Inspiration.query.all()
            self.assertEqual(len(items), 1)
            self.assertIsNotNone(items[0].children)

    def test_unmerge_restores_children(self):
        merge_response = self.client.post(
            "/api/merge",
            json={"ids": [self.first_id, self.second_id]},
        )
        self.assertEqual(merge_response.status_code, 200)
        group_id = merge_response.get_json()["id"]

        response = self.client.post(f"/api/unmerge/{group_id}")
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["success"])
        self.assertEqual(payload["restored"], 2)

        with self.app.app_context():
            items = Inspiration.query.order_by(Inspiration.id.asc()).all()
            self.assertEqual(len(items), 2)
            titles = {item.title for item in items}
            self.assertEqual(titles, {"Alpha idea", "Beta note"})

    def test_unmerge_missing_record_returns_readable_error(self):
        response = self.client.post("/api/unmerge/999999")

        self.assertEqual(response.status_code, 404)
        payload = response.get_json()
        self.assertFalse(payload["success"])
        self.assertEqual(payload["error"], "记录不存在")

    def test_image_upload_infers_image_type(self):
        response = self.client.post(
            "/api/add",
            data={
                "title": "Image note",
                "content": "",
                "content_type": TYPE_TEXT,
                "status": STATUS_INBOX,
                "file": (BytesIO(b"fake image bytes"), "cover.png"),
            },
            content_type="multipart/form-data",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["success"])

        with self.app.app_context():
            item = db.session.get(Inspiration, payload["id"])
            self.assertEqual(item.content_type, TYPE_IMAGE)
            self.assertIsNotNone(item.file_path)

    def test_fetch_title_rejects_invalid_url(self):
        response = self.client.get("/api/fetch-title?url=http://localhost/test")

        self.assertEqual(response.status_code, 400)
        payload = response.get_json()
        self.assertFalse(payload["success"])


    def test_extract_title_from_url_prefers_bilibili_api(self):
        class MockResponse:
            def __init__(self, json_payload):
                self._json_payload = json_payload
                self.headers = {"Content-Type": "application/json"}
                self.url = "https://www.bilibili.com/video/BV1QfXtBcELP"

            def raise_for_status(self):
                return None

            def json(self):
                return self._json_payload

        with patch(
            "brain_app.services.requests.get",
            return_value=MockResponse({"data": {"title": "测试标题"}}),
        ):
            title = extract_title_from_url("https://www.bilibili.com/video/BV1QfXtBcELP?spm_id_from=333")

        self.assertEqual(title, "测试标题")

    def test_analyze_paste_infers_link_metadata(self):
        with patch("brain_app.services.validate_outbound_url", return_value=True), patch(
            "brain_app.services.extract_title_from_url", return_value="OpenAI Python SDK"
        ):
            response = self.client.post(
                "/api/analyze-paste",
                json={"content": "https://github.com/openai/openai-python"},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["success"])
        self.assertEqual(payload["title"], "OpenAI Python SDK")
        self.assertEqual(payload["content_type"], TYPE_LINK)
        self.assertEqual(payload["source"], "GitHub")
        self.assertEqual(payload["category"], CATEGORY_DEV)
        self.assertIn("GitHub", payload["tags"])


    def test_analyze_paste_treats_first_line_url_as_link(self):
        content = "https://www.bilibili.com/video/BV1QfXtBcELP?spm_id_from=333.1007.tianma.1-3-3.click\nspm_id_from=333.1007.tianma.1-3-3.click"
        with patch("brain_app.services.validate_outbound_url", return_value=False):
            response = self.client.post(
                "/api/analyze-paste",
                json={"content": content},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["success"])
        self.assertEqual(payload["content_type"], TYPE_LINK)
        self.assertIn("B", payload["source"])
        self.assertTrue(payload["url"].startswith("https://www.bilibili.com/video/BV1QfXtBcELP"))
        self.assertNotIn("spm_id_from", payload["title"])
        self.assertEqual(payload["title"], "B站内容")

    def test_analyze_paste_uses_fetched_title_for_category_and_tags(self):
        with patch("brain_app.services.validate_outbound_url", return_value=True), patch(
            "brain_app.services.extract_title_from_url", return_value="Figma UI design guide"
        ):
            response = self.client.post(
                "/api/analyze-paste",
                json={"content": "https://example.com/post/123"},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["success"])
        self.assertEqual(payload["content_type"], TYPE_LINK)
        self.assertEqual(payload["title"], "Figma UI design guide")
        self.assertEqual(payload["category"], "\u8bbe\u8ba1")
        self.assertIn("\u8bbe\u8ba1", payload["tags"])

    def test_analyze_paste_infers_text_metadata(self):
        response = self.client.post(
            "/api/analyze-paste",
            json={"content": TEXT_INPUT},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["success"])
        self.assertEqual(payload["content_type"], TYPE_TEXT)
        self.assertEqual(payload["title"], TEXT_INPUT)
        self.assertEqual(payload["source"], "")
        self.assertIn(payload["category"], {"", CATEGORY_PRODUCT})
        self.assertIn("AI", payload["tags"])
        self.assertIn(TAG_AUTOMATION, payload["tags"])

    def test_create_app_migrates_legacy_sqlite_schema(self):
        legacy_dir = tempfile.TemporaryDirectory()
        self.addCleanup(legacy_dir.cleanup)
        legacy_root = Path(legacy_dir.name)
        legacy_db_path = legacy_root / "instance" / "legacy.db"
        legacy_db_path.parent.mkdir(parents=True, exist_ok=True)

        conn = sqlite3.connect(legacy_db_path)
        conn.execute(
            """
            CREATE TABLE inspiration (
                id INTEGER NOT NULL PRIMARY KEY,
                title VARCHAR(200) NOT NULL,
                content TEXT,
                content_type VARCHAR(50) NOT NULL,
                file_path VARCHAR(500),
                source VARCHAR(200),
                category VARCHAR(100),
                tags VARCHAR(500),
                status VARCHAR(50) NOT NULL,
                notes TEXT,
                children TEXT,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL
            )
            """
        )
        conn.execute(
            """
            INSERT INTO inspiration (
                title, content, content_type, source, category, tags, status, notes, children, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            """,
            ("Legacy item", "hello", TYPE_TEXT, "Notebook", "开发", "legacy", STATUS_INBOX, "", None),
        )
        conn.commit()
        conn.close()

        app = create_app(
            {
                "TESTING": True,
                "SQLALCHEMY_DATABASE_URI": f"sqlite:///{legacy_db_path.as_posix()}",
                "UPLOAD_FOLDER": str(legacy_root / "uploads"),
            }
        )

        migrated_conn = sqlite3.connect(legacy_db_path)
        columns = {row[1] for row in migrated_conn.execute("PRAGMA table_info(inspiration)").fetchall()}
        tables = {row[0] for row in migrated_conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
        migrated_conn.close()

        self.assertIn("box_id", columns)
        self.assertIn("is_inbox", columns)
        self.assertIn("box", tables)

        response = app.test_client().get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("Legacy item", response.get_data(as_text=True))
        with app.app_context():
            db.session.remove()
            db.engine.dispose()


if __name__ == "__main__":
    unittest.main()





