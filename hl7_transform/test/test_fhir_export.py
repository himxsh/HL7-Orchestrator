"""FHIR R4 export of a transformed HL7 message."""
import unittest

from hl7_transform.fhir_export import hl7_to_fhir_bundle

SAMPLE = "\n".join([
    r"MSH|^~\&|LAB|HOSP|EHR|HOSP|20261028120000||ORU^R01|MSG0001|P|2.5.1",
    "PID|1||10000032^^^HOSP^MR||SHARMA^ANITA||19800101|F|||12 MG ROAD^^JAIPUR^RJ^302001||9876543210",
    "OBR|1|||2345-7^Glucose^LN|||20261028093000",
    "OBX|1|NM|2345-7^Glucose^LN||5.4|mmol/L|3.9-6.1|N|||F",
    "NTE|1||Call 1234 5678 9012 after review",
    "ZSH|1|SHA256|abc123def456|SIGNED|20261028120000",
])


def _resources(bundle, resource_type):
    return [
        entry["resource"]
        for entry in bundle["entry"]
        if entry["resource"]["resourceType"] == resource_type
    ]


class TestFhirExport(unittest.TestCase):
    def test_oru_becomes_a_collection_bundle(self):
        bundle = hl7_to_fhir_bundle(SAMPLE)

        self.assertEqual(bundle["resourceType"], "Bundle")
        self.assertEqual(bundle["type"], "collection")
        self.assertEqual(bundle["id"], "MSG0001")
        self.assertEqual(bundle["timestamp"], "2026-10-28T12:00:00Z")
        self.assertEqual(bundle["meta"]["tag"][0]["code"], "SHA256")
        self.assertEqual(bundle["meta"]["tag"][0]["display"], "abc123def456")

        patient = _resources(bundle, "Patient")[0]
        self.assertEqual(patient["name"][0]["family"], "SHARMA")
        self.assertEqual(patient["name"][0]["given"], ["ANITA"])
        self.assertEqual(patient["gender"], "female")
        self.assertEqual(patient["birthDate"], "1980-01-01")
        self.assertEqual(patient["address"][0]["city"], "JAIPUR")
        self.assertEqual(patient["address"][0]["state"], "RJ")
        self.assertEqual(patient["identifier"][0]["value"], "10000032")

        observation = _resources(bundle, "Observation")[0]
        self.assertEqual(observation["code"]["coding"][0]["code"], "2345-7")
        self.assertEqual(observation["code"]["coding"][0]["system"], "http://loinc.org")
        self.assertEqual(observation["valueQuantity"]["value"], 5.4)
        self.assertEqual(observation["valueQuantity"]["unit"], "mmol/L")
        self.assertEqual(observation["referenceRange"][0]["low"]["value"], 3.9)
        self.assertEqual(observation["referenceRange"][0]["high"]["value"], 6.1)
        self.assertEqual(observation["interpretation"][0]["coding"][0]["code"], "N")
        self.assertEqual(observation["effectiveDateTime"], "2026-10-28T09:30:00Z")
        self.assertEqual(observation["subject"]["reference"], bundle["entry"][0]["fullUrl"])

        report = _resources(bundle, "DiagnosticReport")[0]
        self.assertEqual(report["code"]["text"], "Glucose")
        self.assertEqual(len(report["result"]), 1)

    def test_empty_message_is_rejected(self):
        with self.assertRaises(ValueError):
            hl7_to_fhir_bundle("not a message")


if __name__ == "__main__":
    unittest.main()
