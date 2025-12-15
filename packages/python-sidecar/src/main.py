"""
Python Security Sidecar - FastAPI Server

Provides security validation and code execution endpoints for the bt1zar module.
This sidecar preserves the proven Python security implementations:
- ProjectIsolation for path validation
- OWASP validator for vulnerability detection
- SecurePythonExecutor for safe code execution
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import structlog

from .security.isolation import ProjectIsolation
from .security.owasp_validator import OWASPValidator
from .security.secure_executor import SecurePythonExecutor

# Configure logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
)

logger = structlog.get_logger(__name__)

app = FastAPI(
    title="Python Security Sidecar",
    description="Security validation and code execution for BT1ZAR",
    version="0.1.0",
)

# CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request/Response models
class PathValidationRequest(BaseModel):
    """Request to validate a path."""
    project_root: str = Field(..., alias="projectRoot")
    path: str

    class Config:
        populate_by_name = True


class PathValidationResponse(BaseModel):
    """Response from path validation."""
    valid: bool
    resolved_path: str | None = Field(None, alias="resolvedPath")
    error: str | None = None

    class Config:
        populate_by_name = True


class CodeValidationRequest(BaseModel):
    """Request to validate code."""
    code: str
    project_root: str | None = Field(None, alias="projectRoot")
    authorized_imports: list[str] | None = Field(None, alias="authorizedImports")

    class Config:
        populate_by_name = True


class SecurityVulnerability(BaseModel):
    """A detected security vulnerability."""
    id: str
    category: str
    severity: str
    title: str
    description: str
    location: str | None = None
    remediation: str | None = None


class CodeValidationResponse(BaseModel):
    """Response from code validation."""
    valid: bool
    vulnerabilities: list[SecurityVulnerability] = []
    compliance_score: float | None = Field(None, alias="complianceScore")

    class Config:
        populate_by_name = True


class CodeExecutionRequest(BaseModel):
    """Request to execute code."""
    project_root: str = Field(..., alias="projectRoot")
    code: str
    authorized_imports: list[str] = Field(default_factory=list, alias="authorizedImports")
    timeout: int = 60000  # milliseconds

    class Config:
        populate_by_name = True


class CodeExecutionResponse(BaseModel):
    """Response from code execution."""
    success: bool
    result: str | None = None
    output: str | None = None
    error: str | None = None
    execution_time: int | None = Field(None, alias="executionTime")

    class Config:
        populate_by_name = True


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    version: str


# Endpoints
@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Check service health."""
    return HealthResponse(status="healthy", version="0.1.0")


@app.post("/validate/path", response_model=PathValidationResponse)
async def validate_path(request: PathValidationRequest):
    """
    Validate a path against project isolation boundaries.

    Prevents path traversal attacks by ensuring the path is within
    the project root directory.
    """
    try:
        isolation = ProjectIsolation(request.project_root, enable_audit=True)
        validated_path = isolation.validate_path(request.path)

        logger.info(
            "Path validated",
            project_root=request.project_root,
            path=request.path,
            resolved=str(validated_path),
        )

        return PathValidationResponse(
            valid=True,
            resolved_path=str(validated_path),
        )
    except PermissionError as e:
        logger.warning(
            "Path validation failed",
            project_root=request.project_root,
            path=request.path,
            error=str(e),
        )
        return PathValidationResponse(
            valid=False,
            error=str(e),
        )
    except Exception as e:
        logger.error(
            "Path validation error",
            project_root=request.project_root,
            path=request.path,
            error=str(e),
        )
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/validate/code", response_model=CodeValidationResponse)
async def validate_code(request: CodeValidationRequest):
    """
    Validate code for security vulnerabilities.

    Uses OWASP Top 10 validation to detect common vulnerabilities
    like SQL injection, XSS, command injection, etc.
    """
    try:
        validator = OWASPValidator()
        result = validator.validate(request.code)

        vulnerabilities = [
            SecurityVulnerability(
                id=v.id,
                category=v.category,
                severity=v.severity,
                title=v.title,
                description=v.description,
                location=v.location,
                remediation=v.remediation,
            )
            for v in result.vulnerabilities
        ]

        logger.info(
            "Code validated",
            vulnerabilities_count=len(vulnerabilities),
            compliance_score=result.compliance_score,
        )

        return CodeValidationResponse(
            valid=result.valid,
            vulnerabilities=vulnerabilities,
            compliance_score=result.compliance_score,
        )
    except Exception as e:
        logger.error("Code validation error", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/validate/owasp", response_model=CodeValidationResponse)
async def validate_owasp(config: dict):
    """
    Run OWASP validation on configuration.
    """
    try:
        validator = OWASPValidator()
        # Convert config to string for validation
        import json
        config_str = json.dumps(config)
        result = validator.validate(config_str)

        vulnerabilities = [
            SecurityVulnerability(
                id=v.id,
                category=v.category,
                severity=v.severity,
                title=v.title,
                description=v.description,
                location=v.location,
                remediation=v.remediation,
            )
            for v in result.vulnerabilities
        ]

        return CodeValidationResponse(
            valid=result.valid,
            vulnerabilities=vulnerabilities,
            compliance_score=result.compliance_score,
        )
    except Exception as e:
        logger.error("OWASP validation error", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/execute", response_model=CodeExecutionResponse)
async def execute_code(request: CodeExecutionRequest):
    """
    Execute code securely within project isolation.

    Uses SecurePythonExecutor with:
    - ProjectIsolation for path validation
    - Import authorization
    - Timeout enforcement
    """
    try:
        isolation = ProjectIsolation(request.project_root, enable_audit=True)
        executor = SecurePythonExecutor(
            project_isolation=isolation,
            additional_authorized_imports=request.authorized_imports,
        )

        import time
        start_time = time.time()

        result = executor.execute(
            request.code,
            timeout_ms=request.timeout,
        )

        execution_time = int((time.time() - start_time) * 1000)

        logger.info(
            "Code executed",
            success=result.success,
            execution_time_ms=execution_time,
        )

        return CodeExecutionResponse(
            success=result.success,
            result=str(result.result) if result.result is not None else None,
            output=result.output,
            error=result.error,
            execution_time=execution_time,
        )
    except Exception as e:
        logger.error("Code execution error", error=str(e))
        return CodeExecutionResponse(
            success=False,
            error=str(e),
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8766)
