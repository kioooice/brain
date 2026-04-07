import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

from brain_app import create_app
from brain_app.extensions import db
from brain_app.models import Box, Inspiration
from brain_app.services import extract_title_from_url
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
        self.temp_dir.cleanup()

    def test_index_page_renders(self):
        response = self.client.get("/")

        self.assertEqual(response.status_code, 200)
        html = response.get_data(as_text=True)
        self.assertIn(APP_TITLE, html)
        self.assertIn("Alpha idea", html)

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


if __name__ == "__main__":
    unittest.main()





