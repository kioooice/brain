import gc
import tempfile
import time
import unittest
from pathlib import Path

from brain_app import create_app
from brain_app.constants import STATUS_INBOX, TYPE_TEXT
from brain_app.extensions import db
from brain_app.models import Inspiration


class TestMobileApiCase(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        temp_root = Path(self.temp_dir.name)
        self.db_path = temp_root / "instance" / "test_mobile.db"
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
            seed = Inspiration(
                title="Seed",
                content="hello",
                content_type=TYPE_TEXT,
                status=STATUS_INBOX,
            )
            db.session.add(seed)
            db.session.commit()
            self.seed_id = seed.id

    def tearDown(self):
        with self.app.app_context():
            db.session.remove()
            db.drop_all()
            db.engine.dispose()
        self.client = None
        self.app = None
        gc.collect()
        for _ in range(3):
            try:
                self.temp_dir.cleanup()
                break
            except (PermissionError, NotADirectoryError):
                gc.collect()
                time.sleep(0.05)

    def test_meta_endpoint(self):
        response = self.client.get("/api/meta")

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertIn("statuses", payload)
        self.assertIn("content_types", payload)
        self.assertIn("categories", payload)

    def test_json_create_and_detail(self):
        create_response = self.client.post(
            "/api/items",
            json={
                "title": "New idea",
                "content": "Ship mobile app",
                "content_type": TYPE_TEXT,
                "status": STATUS_INBOX,
            },
        )

        self.assertEqual(create_response.status_code, 201)
        item = create_response.get_json()["item"]
        self.assertEqual(item["title"], "New idea")

        detail_response = self.client.get(f"/api/items/{item['id']}")
        self.assertEqual(detail_response.status_code, 200)
        detail_item = detail_response.get_json()["item"]
        self.assertEqual(detail_item["content"], "Ship mobile app")

    def test_json_update_and_delete(self):
        update_response = self.client.put(
            f"/api/items/{self.seed_id}",
            json={
                "title": "Seed updated",
                "content": "updated content",
                "content_type": TYPE_TEXT,
                "status": STATUS_INBOX,
            },
        )
        self.assertEqual(update_response.status_code, 200)
        self.assertEqual(update_response.get_json()["item"]["title"], "Seed updated")

        delete_response = self.client.delete(f"/api/items/{self.seed_id}")
        self.assertEqual(delete_response.status_code, 200)
        self.assertTrue(delete_response.get_json()["success"])

        missing_response = self.client.get(f"/api/items/{self.seed_id}")
        self.assertEqual(missing_response.status_code, 404)
        self.assertEqual(missing_response.get_json()["error"], "记录不存在")


if __name__ == "__main__":
    unittest.main()
