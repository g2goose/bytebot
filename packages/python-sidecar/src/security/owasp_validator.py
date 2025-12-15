"""
OWASP Top 10 Security Validator.
Simplified version ported from bt1zar_bt1_CLI/core/src/security/owasp_validator.py
"""

import re
from dataclasses import dataclass, field
from typing import Literal

import structlog

logger = structlog.get_logger(__name__)

Severity = Literal["critical", "high", "medium", "low", "info"]


@dataclass
class Vulnerability:
    """A detected security vulnerability."""

    id: str
    category: str
    severity: Severity
    title: str
    description: str
    location: str | None = None
    remediation: str | None = None


@dataclass
class ValidationResult:
    """Result of OWASP validation."""

    valid: bool
    vulnerabilities: list[Vulnerability] = field(default_factory=list)
    compliance_score: float = 100.0


class OWASPValidator:
    """
    OWASP Top 10 Security Validator.

    Detects common security vulnerabilities:
    - SQL Injection (A03:2021)
    - XSS (A03:2021)
    - Command Injection (A03:2021)
    - Path Traversal (A01:2021)
    - SSRF (A10:2021)
    """

    # SQL Injection patterns
    SQL_PATTERNS = [
        (r"(?i)\bSELECT\b.*\bFROM\b.*\bWHERE\b.*=\s*['\"]?\s*\+", "SQL concatenation"),
        (r"(?i)\bINSERT\b.*\bINTO\b.*\bVALUES\b.*\+", "SQL INSERT concatenation"),
        (r"(?i)\bUPDATE\b.*\bSET\b.*=.*\+", "SQL UPDATE concatenation"),
        (r"(?i)\bDELETE\b.*\bFROM\b.*\bWHERE\b.*\+", "SQL DELETE concatenation"),
        (r"(?i)execute\s*\(\s*['\"].*\+", "Dynamic SQL execution"),
        (r"(?i)f['\"].*\{.*\}.*SELECT", "F-string SQL query"),
        (r"(?i)f['\"].*\{.*\}.*INSERT", "F-string SQL query"),
        (r"(?i)f['\"].*\{.*\}.*UPDATE", "F-string SQL query"),
        (r"(?i)f['\"].*\{.*\}.*DELETE", "F-string SQL query"),
    ]

    # XSS patterns
    XSS_PATTERNS = [
        (r"(?i)innerHTML\s*=", "Direct innerHTML assignment"),
        (r"(?i)document\.write\s*\(", "document.write usage"),
        (r"(?i)eval\s*\(", "eval() usage"),
        (r"<script.*>.*</script>", "Inline script tag"),
        (r"(?i)on\w+\s*=\s*['\"]", "Inline event handler"),
    ]

    # Command Injection patterns
    CMD_PATTERNS = [
        (r"(?i)os\.system\s*\(.*\+", "os.system with concatenation"),
        (r"(?i)subprocess\.(?:run|call|Popen)\s*\(.*\+", "subprocess with concatenation"),
        (r"(?i)exec\s*\(.*\+", "exec with concatenation"),
        (r"(?i)shell\s*=\s*True", "shell=True in subprocess"),
        (r"(?i)os\.popen\s*\(", "os.popen usage"),
    ]

    # Path Traversal patterns
    PATH_PATTERNS = [
        (r"\.\./", "Parent directory traversal"),
        (r"\.\.\\\\", "Windows parent directory traversal"),
        (r"(?i)/etc/passwd", "Access to /etc/passwd"),
        (r"(?i)/etc/shadow", "Access to /etc/shadow"),
        (r"(?i)C:\\\\Windows", "Windows system directory"),
    ]

    # SSRF patterns
    SSRF_PATTERNS = [
        (r"(?i)requests\.(?:get|post|put|delete)\s*\(.*\+", "HTTP request with concatenation"),
        (r"(?i)urllib\.request\.urlopen\s*\(.*\+", "urlopen with concatenation"),
        (r"(?i)http\.client", "http.client usage"),
        (r"(?i)127\.0\.0\.1|localhost", "Localhost access"),
        (r"(?i)169\.254\.", "AWS metadata IP"),
    ]

    def __init__(self):
        self.patterns = {
            "A03:2021-Injection-SQL": self.SQL_PATTERNS,
            "A03:2021-Injection-XSS": self.XSS_PATTERNS,
            "A03:2021-Injection-CMD": self.CMD_PATTERNS,
            "A01:2021-Broken Access Control": self.PATH_PATTERNS,
            "A10:2021-SSRF": self.SSRF_PATTERNS,
        }

    def validate(self, code: str) -> ValidationResult:
        """
        Validate code for OWASP Top 10 vulnerabilities.

        Args:
            code: Source code to validate

        Returns:
            ValidationResult with detected vulnerabilities
        """
        vulnerabilities: list[Vulnerability] = []
        vuln_id = 0

        for category, patterns in self.patterns.items():
            for pattern, desc in patterns:
                matches = list(re.finditer(pattern, code))
                for match in matches:
                    vuln_id += 1

                    # Determine line number
                    line_num = code[: match.start()].count("\n") + 1

                    vulnerabilities.append(
                        Vulnerability(
                            id=f"OWASP-{vuln_id:04d}",
                            category=category,
                            severity=self._get_severity(category),
                            title=desc,
                            description=f"Potential {desc} vulnerability detected",
                            location=f"Line {line_num}",
                            remediation=self._get_remediation(category),
                        )
                    )

        # Calculate compliance score
        critical_count = sum(1 for v in vulnerabilities if v.severity == "critical")
        high_count = sum(1 for v in vulnerabilities if v.severity == "high")
        medium_count = sum(1 for v in vulnerabilities if v.severity == "medium")

        # Deduct points: critical=25, high=15, medium=5
        score = 100.0 - (critical_count * 25) - (high_count * 15) - (medium_count * 5)
        score = max(0.0, score)

        valid = len([v for v in vulnerabilities if v.severity in ("critical", "high")]) == 0

        logger.info(
            "OWASP validation complete",
            vulnerabilities=len(vulnerabilities),
            critical=critical_count,
            high=high_count,
            compliance_score=score,
            valid=valid,
        )

        return ValidationResult(
            valid=valid,
            vulnerabilities=vulnerabilities,
            compliance_score=score,
        )

    def _get_severity(self, category: str) -> Severity:
        """Get severity for a category."""
        if "Injection" in category:
            return "critical"
        elif "Access Control" in category:
            return "high"
        elif "SSRF" in category:
            return "high"
        return "medium"

    def _get_remediation(self, category: str) -> str:
        """Get remediation guidance for a category."""
        remediations = {
            "A03:2021-Injection-SQL": "Use parameterized queries or ORM instead of string concatenation",
            "A03:2021-Injection-XSS": "Sanitize user input and use Content Security Policy",
            "A03:2021-Injection-CMD": "Avoid shell=True and use array-based subprocess calls",
            "A01:2021-Broken Access Control": "Validate and sanitize all file paths, use allowlists",
            "A10:2021-SSRF": "Validate URLs against allowlist, block internal IPs",
        }
        return remediations.get(category, "Review and fix the identified vulnerability")
