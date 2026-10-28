"""Encrypted pseudonym vault: enroll, reveal, and an audit log without plaintext."""
import tempfile
import unittest
from pathlib import Path

from hl7_transform.anonymizer import Anonymizer
from hl7_transform.pseudonym_vault import PseudonymVault, VaultError


class TestPseudonymVault(unittest.TestCase):
    def setUp(self):
        self._temp = tempfile.TemporaryDirectory()
        self.path = Path(self._temp.name) / "vault.json"
        self.vault = PseudonymVault(self.path, b"k" * 32)

    def tearDown(self):
        self._temp.cleanup()

    def test_enroll_hides_the_original_and_matches_the_pipeline_pseudonym(self):
        original = "Zzqx Realperson"
        enrolled = self.vault.enroll("10000032", original, actor="operator")
        last, first = Anonymizer().anonymize_name(10000032)

        self.assertEqual(enrolled["pseudonym"], "%s, %s" % (last, first))
        self.assertFalse(enrolled["updated"])
        self.assertNotIn("original_name", enrolled)

        stored = self.path.read_text(encoding="utf-8")
        self.assertNotIn(original, stored)

        visible = self.vault.snapshot()
        self.assertEqual(visible["subjects"][0]["subject_id"], "10000032")
        self.assertEqual(visible["subjects"][0]["reveal_count"], 0)
        self.assertNotIn(original, str(visible))
        self.assertEqual(visible["audit"][0]["action"], "ENROLL")

    def test_reveal_requires_a_reason_and_is_audited(self):
        original = "Zzqx Realperson"
        self.vault.enroll("10000032", original, actor="operator")

        with self.assertRaises(VaultError):
            self.vault.reveal("10000032", "no", actor="admin")
        with self.assertRaises(KeyError):
            self.vault.reveal("999", "continuity of care", actor="admin")

        revealed = self.vault.reveal("10000032", "continuity of care", actor="admin")
        self.assertEqual(revealed["original_name"], original)
        self.assertEqual(revealed["reveal_count"], 1)

        audit = self.vault.snapshot()["audit"]
        self.assertEqual(audit[-1]["action"], "REVEAL")
        self.assertEqual(audit[-1]["reason"], "continuity of care")
        self.assertEqual(audit[-1]["actor"], "admin")
        self.assertNotIn(original, self.path.read_text(encoding="utf-8"))

    def test_reenroll_updates_ciphertext_without_a_second_row(self):
        self.vault.enroll("10000032", "Zzqx Realperson", actor="operator")
        updated = self.vault.enroll("10000032", "Zzqx Realperson II", actor="operator")
        self.assertTrue(updated["updated"])
        self.assertEqual(len(self.vault.snapshot()["subjects"]), 1)
        revealed = self.vault.reveal("10000032", "correct a typo", actor="admin")
        self.assertEqual(revealed["original_name"], "Zzqx Realperson II")


if __name__ == "__main__":
    unittest.main()
