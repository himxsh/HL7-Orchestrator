"""AES-256-CBC must be real cryptography, not a hash dressed up as a cipher."""
import unittest

from hl7_transform.encryption import EncryptionComparator


class TestEncryptionComparator(unittest.TestCase):
    def test_aes_is_a_real_cipher(self):
        message = "MSH|^~\\&|LAB|HOSP"
        results = EncryptionComparator().compare(message)
        self.assertEqual(
            [item.algorithm_type for item in results],
            ["hash", "cipher", "mac", "hash"],
        )
        aes = results[1]
        self.assertEqual(aes.name, "AES-256-CBC")
        self.assertNotIn("SIMULATION", aes.name)
        self.assertNotIn("SHA-512", aes.name)
        self.assertGreater(aes.output_size_bytes, len(message))
        self.assertEqual(aes.output_size_bytes % 16, 0)
        self.assertEqual(aes.key_size_bits, 256)


if __name__ == "__main__":
    unittest.main()
