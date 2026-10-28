"""
Tests for hl7_transform.operations module.
"""
import unittest
import warnings

from hl7_transform.message import HL7Message
from hl7_transform.operations import HL7Operation, GenerateCurrentDatetime, GenerateAplhanumericID, GenerateNumericID


class TestHL7Operation(unittest.TestCase):
    def setUp(self):
        pass

    def tearDown(self):
        pass

    def test_cannot_instatiate_abstract_class(self):
        with self.assertRaises(TypeError):
            HL7Operation()

    def test_str(self):
        self.assertEqual('<GenerateCurrentDatetime>', str(GenerateCurrentDatetime(['MSH.2'], {})))

    def test_execute(self):
        op = GenerateCurrentDatetime(['MSH.2'], {})
        msg = HL7Message.from_file('hl7_transform/test/test_transform.hl7')
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            res1 = op.execute(msg)
        self.assertTrue(any('deprecated' in str(item.message) for item in caught))
        res2 = op(msg)
        self.assertEqual(res1, res2)

    def test_generatealphanumericid(self):
        field = 'NTE.4'
        op = GenerateAplhanumericID([field], {})
        msg = HL7Message.from_file('hl7_transform/test/test_transform.hl7')
        res = op(msg)
        self.assertIsNotNone(res)

    def test_generatenumericid(self):
        field = 'NTE.4'
        op = GenerateNumericID([field], {})
        msg = HL7Message.from_file('hl7_transform/test/test_transform.hl7')
        res = op(msg)
        self.assertTrue(0 <= int(res) <= 1_000_000_000)
