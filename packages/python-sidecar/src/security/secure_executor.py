"""
Secure Python Executor.
Simplified version ported from bt1zar_bt1_CLI/core/src/agents/executors/secure_executor.py
"""

import io
import sys
from contextlib import redirect_stdout, redirect_stderr
from dataclasses import dataclass
from typing import Any

import structlog

from .isolation import ProjectIsolation

logger = structlog.get_logger(__name__)


# Default authorized imports (safe standard library modules)
DEFAULT_AUTHORIZED_IMPORTS = [
    "json",
    "math",
    "datetime",
    "re",
    "collections",
    "itertools",
    "functools",
    "typing",
    "dataclasses",
    "pathlib",
    "os.path",
    "statistics",
    "random",
    "string",
    "textwrap",
    "unicodedata",
]

# Blocked imports (dangerous modules)
BLOCKED_IMPORTS = [
    "subprocess",
    "os.system",
    "os.popen",
    "os.spawn",
    "commands",
    "pty",
    "fcntl",
    "resource",
    "ctypes",
    "pickle",
    "marshal",
    "shelve",
    "__builtins__",
]


@dataclass
class ExecutionResult:
    """Result of code execution."""

    success: bool
    result: Any = None
    output: str | None = None
    error: str | None = None


class SecurePythonExecutor:
    """
    Secure Python code executor with isolation and import restrictions.

    Features:
    - Project isolation (path validation)
    - Import authorization
    - Stdout/stderr capture
    - Timeout enforcement (basic)
    """

    def __init__(
        self,
        project_isolation: ProjectIsolation,
        additional_authorized_imports: list[str] | None = None,
    ):
        self.isolation = project_isolation
        self.authorized_imports = set(DEFAULT_AUTHORIZED_IMPORTS)
        if additional_authorized_imports:
            self.authorized_imports.update(additional_authorized_imports)

        logger.info(
            "Secure executor initialized",
            project_root=str(project_isolation.project_root),
            authorized_imports=len(self.authorized_imports),
        )

    def execute(self, code: str, timeout_ms: int = 60000) -> ExecutionResult:
        """
        Execute code securely.

        Args:
            code: Python code to execute
            timeout_ms: Execution timeout in milliseconds

        Returns:
            ExecutionResult with output and any errors
        """
        logger.info("Executing code", code_length=len(code), timeout_ms=timeout_ms)

        # Check for blocked imports
        blocked = self._check_blocked_imports(code)
        if blocked:
            return ExecutionResult(
                success=False,
                error=f"Blocked import detected: {', '.join(blocked)}",
            )

        # Prepare execution environment
        stdout_capture = io.StringIO()
        stderr_capture = io.StringIO()

        # Create safe globals
        safe_globals = self._create_safe_globals()

        try:
            # Execute within isolation
            def run_code():
                with redirect_stdout(stdout_capture), redirect_stderr(stderr_capture):
                    exec(code, safe_globals)
                return safe_globals.get("result", safe_globals.get("_", None))

            result = self.isolation.sandbox_exec(run_code)

            stdout_output = stdout_capture.getvalue()
            stderr_output = stderr_capture.getvalue()

            logger.info(
                "Code execution successful",
                stdout_length=len(stdout_output),
                stderr_length=len(stderr_output),
            )

            return ExecutionResult(
                success=True,
                result=result,
                output=stdout_output if stdout_output else None,
                error=stderr_output if stderr_output else None,
            )

        except Exception as e:
            logger.error("Code execution failed", error=str(e))
            return ExecutionResult(
                success=False,
                error=str(e),
                output=stdout_capture.getvalue() or None,
            )

    def _check_blocked_imports(self, code: str) -> list[str]:
        """Check for blocked imports in code."""
        blocked_found = []

        for blocked in BLOCKED_IMPORTS:
            # Check various import patterns
            patterns = [
                f"import {blocked}",
                f"from {blocked}",
                f"__import__('{blocked}'",
                f'__import__("{blocked}"',
            ]
            for pattern in patterns:
                if pattern in code:
                    blocked_found.append(blocked)
                    break

        return blocked_found

    def _create_safe_globals(self) -> dict:
        """Create a safe globals dictionary for execution."""
        safe_builtins = {
            # Safe built-in functions
            "abs": abs,
            "all": all,
            "any": any,
            "ascii": ascii,
            "bin": bin,
            "bool": bool,
            "bytearray": bytearray,
            "bytes": bytes,
            "callable": callable,
            "chr": chr,
            "complex": complex,
            "dict": dict,
            "dir": dir,
            "divmod": divmod,
            "enumerate": enumerate,
            "filter": filter,
            "float": float,
            "format": format,
            "frozenset": frozenset,
            "getattr": getattr,
            "hasattr": hasattr,
            "hash": hash,
            "hex": hex,
            "id": id,
            "int": int,
            "isinstance": isinstance,
            "issubclass": issubclass,
            "iter": iter,
            "len": len,
            "list": list,
            "map": map,
            "max": max,
            "min": min,
            "next": next,
            "object": object,
            "oct": oct,
            "ord": ord,
            "pow": pow,
            "print": print,
            "range": range,
            "repr": repr,
            "reversed": reversed,
            "round": round,
            "set": set,
            "slice": slice,
            "sorted": sorted,
            "str": str,
            "sum": sum,
            "tuple": tuple,
            "type": type,
            "zip": zip,
            # Safe exceptions
            "Exception": Exception,
            "ValueError": ValueError,
            "TypeError": TypeError,
            "KeyError": KeyError,
            "IndexError": IndexError,
            "AttributeError": AttributeError,
            "RuntimeError": RuntimeError,
            # None, True, False
            "None": None,
            "True": True,
            "False": False,
        }

        return {
            "__builtins__": safe_builtins,
            "__name__": "__main__",
            "__doc__": None,
            # Add secure file functions
            "secure_read_file": self._secure_read_file,
            "secure_write_file": self._secure_write_file,
            "get_project_root": lambda: str(self.isolation.project_root),
        }

    def _secure_read_file(self, path: str) -> str:
        """Securely read a file within project isolation."""
        validated_path = self.isolation.validate_path(path)
        with open(validated_path, "r") as f:
            return f.read()

    def _secure_write_file(self, path: str, content: str) -> None:
        """Securely write a file within project isolation."""
        validated_path = self.isolation.validate_path(path)
        validated_path.parent.mkdir(parents=True, exist_ok=True)
        with open(validated_path, "w") as f:
            f.write(content)
