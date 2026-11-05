"""Fast tests of the real measurement function without rendering instruments."""
import ast
import json
from pathlib import Path
import re
import subprocess
import tempfile
import unittest

class MeasurementTests(unittest.TestCase):
    def test_missing_loudness_metadata_has_an_actionable_error(self):
        source = Path(__file__).with_name("finish.py").read_text()
        function = next(n for n in ast.parse(source).body if isinstance(n, ast.FunctionDef) and n.name == "measure")
        with tempfile.TemporaryDirectory() as directory:
            namespace = {"P": Path(directory), "re": re, "json": json,
                         "run": lambda _: subprocess.CompletedProcess([], 0, stderr=b"No loudness metadata")}
            exec(compile(ast.Module(body=[function], type_ignores=[]), "finish.py", "exec"), namespace)
            with self.assertRaisesRegex(RuntimeError, "loudness metadata"):
                namespace["measure"]("synthetic.mp3")

if __name__ == "__main__":
    unittest.main()
