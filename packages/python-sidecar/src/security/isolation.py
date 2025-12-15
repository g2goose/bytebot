"""
Project root isolation with audit logging.
Ported from bt1zar_bt1_CLI/core/src/security/isolation.py
"""

from pathlib import Path
from typing import Any, Callable

import structlog

logger = structlog.get_logger(__name__)


class ProjectIsolation:
    """Enforces strict project boundary isolation for security."""

    def __init__(self, project_root: str, enable_audit: bool = True):
        self.project_root = Path(project_root).resolve()
        self.enable_audit = enable_audit

        if not self.project_root.exists():
            raise ValueError(f"Project root does not exist: {project_root}")

        logger.info(
            "Project isolation initialized",
            project_root=str(self.project_root),
            audit_enabled=enable_audit,
        )

    def validate_path(self, path: str) -> Path:
        """
        Validate path is within project boundary.

        Args:
            path: File path to validate

        Returns:
            Resolved path within project boundary

        Raises:
            PermissionError: If path traversal is detected
        """
        try:
            # Handle both relative and absolute paths
            if Path(path).is_absolute():
                target = Path(path).resolve()
            else:
                target = (self.project_root / path).resolve()

            # Check if target is within project boundary
            if not target.is_relative_to(self.project_root):
                if self.enable_audit:
                    logger.warning(
                        "Path traversal attempt blocked",
                        requested_path=path,
                        resolved_path=str(target),
                        project_root=str(self.project_root),
                    )
                raise PermissionError(f"Path traversal detected: {path}")

            if self.enable_audit:
                logger.debug(
                    "Path validation successful",
                    requested_path=path,
                    resolved_path=str(target),
                )

            return target

        except PermissionError:
            raise
        except Exception as e:
            if self.enable_audit:
                logger.error("Path validation failed", requested_path=path, error=str(e))
            raise

    def sandbox_exec(self, func: Callable, *args: Any, **kwargs: Any) -> Any:
        """
        Execute function within project sandbox.

        Args:
            func: Function to execute
            *args: Function arguments
            **kwargs: Function keyword arguments

        Returns:
            Function result
        """
        import os

        old_cwd = os.getcwd()

        if self.enable_audit:
            logger.info(
                "Entering sandbox execution",
                function=func.__name__,
                old_cwd=old_cwd,
                sandbox_root=str(self.project_root),
            )

        try:
            os.chdir(self.project_root)
            result = func(*args, **kwargs)

            if self.enable_audit:
                logger.info("Sandbox execution completed successfully", function=func.__name__)
            return result

        except Exception as e:
            if self.enable_audit:
                logger.error("Sandbox execution failed", function=func.__name__, error=str(e))
            raise
        finally:
            os.chdir(old_cwd)
            if self.enable_audit:
                logger.debug("Restored original working directory", restored_cwd=old_cwd)

    def is_safe_path(self, path: str) -> bool:
        """
        Check if path is safe without raising exception.

        Args:
            path: Path to check

        Returns:
            True if path is within project boundary
        """
        try:
            self.validate_path(path)
            return True
        except PermissionError:
            return False

    def get_relative_path(self, path: str) -> str:
        """
        Get path relative to project root.

        Args:
            path: Path to convert

        Returns:
            Path relative to project root

        Raises:
            PermissionError: If path is outside project boundary
        """
        validated_path = self.validate_path(path)
        return str(validated_path.relative_to(self.project_root))

    def list_allowed_paths(self, pattern: str = "*") -> list[Path]:
        """
        List all paths matching pattern within project boundary.

        Args:
            pattern: Glob pattern to match

        Returns:
            List of allowed paths
        """
        try:
            paths = list(self.project_root.glob(pattern))
            if self.enable_audit:
                logger.debug("Listed allowed paths", pattern=pattern, count=len(paths))
            return paths
        except Exception as e:
            if self.enable_audit:
                logger.error("Failed to list paths", pattern=pattern, error=str(e))
            return []
