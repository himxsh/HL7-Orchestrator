"""Per-field PHI confidence, with raw identifiers kept out of the report."""
import json
import unittest

from hl7_transform.phi_report import build_phi_report

SAMPLE = "\n".join([
    r"MSH|^~\&|LAB|HOSP|EHR|HOSP|20261028120000||ORU^R01|MSG0001|P|2.5.1",
    "PID|1||10000032^^^HOSP^MR||SHARMA^ANITA||19800101|F|||12 MG ROAD^^JAIPUR^RJ^302001||9876543210",
    "OBR|1|||2345-7^Glucose^LN|||20261028093000",
    "OBX|1|NM|2345-7^Glucose^LN||5.4|mmol/L|3.9-6.1|N|||F",
    "NTE|1||Call 1234 5678 9012 after review",
    "ZSH|1|SHA256|abc123def456|SIGNED|20261028120000",
])


def _by_hl7_field(report, hl7_field):
    return next(item for item in report["fields"] if item["hl7_field"] == hl7_field)


class TestPhiReport(unittest.TestCase):
    def test_hl7_fields_are_scored_and_masked(self):
        report = build_phi_report(hl7=SAMPLE)

        name = _by_hl7_field(report, "PID-5")
        self.assertGreaterEqual(name["confidence"], 0.9)
        self.assertEqual(name["phi_type"], "name")
        self.assertNotIn("SHARMA", name["preview"])

        note = _by_hl7_field(report, "NTE-3")
        self.assertGreaterEqual(note["confidence"], 0.9)
        self.assertEqual(note["phi_type"], "government_id")
        self.assertIn("Aadhaar", " ".join(note["reasons"]))

        glucose = _by_hl7_field(report, "OBX-5")
        self.assertLess(glucose["confidence"], 0.3)
        self.assertEqual(glucose["preview"], "5.4")

        self.assertGreaterEqual(report["summary"]["likely_phi"], 4)
        rendered = json.dumps(report)
        self.assertNotIn("1234 5678 9012", rendered)
        self.assertNotIn("SHARMA^ANITA", rendered)

    def test_csv_columns_use_header_and_value_shape(self):
        table = "\n".join([
            "patient_email,glucose,subject_id",
            "nurse@hospital.test,5.4,10000032",
        ])
        report = build_phi_report(csv_text=table)
        by_field = {item["field"]: item for item in report["fields"]}

        self.assertGreaterEqual(by_field["column:patient_email"]["confidence"], 0.9)
        self.assertEqual(by_field["column:patient_email"]["phi_type"], "email")
        self.assertLess(by_field["column:glucose"]["confidence"], 0.3)
        self.assertGreaterEqual(by_field["column:subject_id"]["confidence"], 0.75)
        self.assertNotIn("nurse@hospital.test", json.dumps(report))

    def test_requires_exactly_one_source(self):
        with self.assertRaises(ValueError):
            build_phi_report()
        with self.assertRaises(ValueError):
            build_phi_report(hl7=SAMPLE, csv_text="a\n1\n")


if __name__ == "__main__":
    unittest.main()
