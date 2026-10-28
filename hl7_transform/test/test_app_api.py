"""
Tests for the FastAPI application layer.
"""
import importlib
import io
import json
import os
import tempfile
import unittest
import uuid
import zipfile
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

os.environ["OPERATOR_TOKEN"] = "op-token"
os.environ["ADMIN_TOKEN"] = "admin-token"

app_module = importlib.import_module("app")


def _parse_sse_payloads(raw_text: str):
    """Extract JSON payloads from a text/event-stream response body."""
    payloads = []
    for line in raw_text.splitlines():
        if not line.startswith("data: "):
            continue
        payloads.append(json.loads(line[len("data: "):]))
    return payloads


class TestAppApi(unittest.TestCase):
    def setUp(self):
        self._temp_dir = tempfile.TemporaryDirectory()
        self.temp_root = Path(self._temp_dir.name)
        self._temp_root_patch = patch.object(app_module, "TEMP_ROOT", self.temp_root)
        self._temp_root_patch.start()
        app_module._download_store.clear()
        app_module._encryption_results_store.clear()
        self.headers = {"Authorization": f"Bearer {os.environ['OPERATOR_TOKEN']}"}
        self.client = TestClient(app_module.app)

    def tearDown(self):
        app_module._download_store.clear()
        app_module._encryption_results_store.clear()
        self._temp_root_patch.stop()
        self._temp_dir.cleanup()

    def test_health_stays_public(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")

    def test_upload_requires_operator_token(self):
        response = self.client.post(
            "/api/upload",
            files={"file": ("patients.csv", b"id,value\n1,2\n", "text/csv")},
        )
        self.assertEqual(response.status_code, 401)

    def test_upload_accepts_valid_csv(self):
        response = self.client.post(
            "/api/upload",
            files={"file": ("patients.csv", b"id,value\n1,2\n", "text/csv")},
            headers=self.headers,
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["filename"], "patients.csv")
        uuid.UUID(payload["runId"])

        stored_path = Path(payload["path"])
        self.assertTrue(stored_path.exists())
        self.assertEqual(stored_path.read_bytes(), b"id,value\n1,2\n")
        self.assertEqual(stored_path.parent.parent, self.temp_root)

    def test_upload_rejects_invalid_extension(self):
        response = self.client.post(
            "/api/upload",
            files={"file": ("patients.txt", b"bad", "text/plain")},
            headers=self.headers,
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("not allowed", response.json()["detail"])

    def test_upload_to_run_rejects_invalid_uuid(self):
        response = self.client.post(
            "/api/upload/not-a-uuid",
            files={"file": ("patients.csv", b"id\n1\n", "text/csv")},
            headers=self.headers,
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "Run directory not found.")

    def test_download_token_is_single_use(self):
        token = "download-token"
        app_module._download_store[token] = {
            "data": b"zip-bytes",
            "created": app_module.time.time(),
        }

        first = self.client.get(f"/api/download/{token}", headers=self.headers)
        second = self.client.get(f"/api/download/{token}", headers=self.headers)

        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.content, b"zip-bytes")
        self.assertEqual(first.headers["content-type"], "application/zip")
        self.assertEqual(second.status_code, 404)
        self.assertIn("expired or invalid", second.json()["detail"])

    def test_run_single_streams_signed_message_and_download(self):
        payload = {
            "fields": {
                "subject_id": "12345",
                "gender": "male",
                "age": "45",
            },
            "observations": [
                {"header": "HB", "value": "13.2"},
                {"header": "COMMENT", "value": "stable"},
            ],
        }

        with patch.object(app_module.time, "sleep", return_value=None):
            response = self.client.post("/api/run-single", json=payload, headers=self.headers)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "text/event-stream; charset=utf-8")

        events = _parse_sse_payloads(response.text)
        statuses = [event["status"] for event in events]
        self.assertIn("completed", statuses)
        self.assertEqual(statuses[-1], "success")

        completed_event = next(event for event in events if event["status"] == "completed")
        success_event = events[-1]

        record = completed_event["record"]
        self.assertEqual(record["id"], "12345")
        self.assertEqual(record["sex"], "M")
        self.assertIn("ZSH|1|SHA256|", record["content"])

        uuid.UUID(success_event["runId"])
        self.assertTrue(success_event["downloadToken"])
        self.assertEqual(len(success_event["encryptionResults"]), 4)

        download = self.client.get(
            f"/api/download/{success_event['downloadToken']}",
            headers=self.headers,
        )
        self.assertEqual(download.status_code, 200)

        archive = zipfile.ZipFile(io.BytesIO(download.content))
        self.assertEqual(archive.namelist(), ["patient_12345.hl7"])
        signed_message = archive.read("patient_12345.hl7").decode("utf-8")
        self.assertIn("PID|1||12345^^^MANUAL^MR||", signed_message)
        self.assertIn("ZSH|1|SHA256|", signed_message)


if __name__ == "__main__":
    unittest.main()
