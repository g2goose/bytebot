/**
 * BT1ZAR Security Types
 * Ported from bt1zar_bt1_CLI/core/src/security/
 */

/**
 * Security vulnerability severity levels
 */
export type SecuritySeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/**
 * OWASP Top 10 categories
 */
export enum OWASPCategory {
  BROKEN_ACCESS_CONTROL = 'A01:2021-Broken Access Control',
  CRYPTOGRAPHIC_FAILURES = 'A02:2021-Cryptographic Failures',
  INJECTION = 'A03:2021-Injection',
  INSECURE_DESIGN = 'A04:2021-Insecure Design',
  SECURITY_MISCONFIGURATION = 'A05:2021-Security Misconfiguration',
  VULNERABLE_COMPONENTS = 'A06:2021-Vulnerable and Outdated Components',
  AUTH_FAILURES = 'A07:2021-Identification and Authentication Failures',
  DATA_INTEGRITY = 'A08:2021-Software and Data Integrity Failures',
  LOGGING_FAILURES = 'A09:2021-Security Logging and Monitoring Failures',
  SSRF = 'A10:2021-Server-Side Request Forgery',
}

/**
 * STRIDE threat categories
 */
export enum STRIDECategory {
  SPOOFING = 'Spoofing',
  TAMPERING = 'Tampering',
  REPUDIATION = 'Repudiation',
  INFORMATION_DISCLOSURE = 'Information Disclosure',
  DENIAL_OF_SERVICE = 'Denial of Service',
  ELEVATION_OF_PRIVILEGE = 'Elevation of Privilege',
}

/**
 * Security vulnerability detected
 */
export interface SecurityVulnerability {
  id: string;
  category: OWASPCategory | STRIDECategory | string;
  severity: SecuritySeverity;
  title: string;
  description: string;
  location?: string;
  remediation?: string;
}

/**
 * Path validation request
 */
export interface PathValidationRequest {
  projectRoot: string;
  path: string;
}

/**
 * Path validation response
 */
export interface PathValidationResponse {
  valid: boolean;
  resolvedPath?: string;
  error?: string;
}

/**
 * Code validation request
 */
export interface CodeValidationRequest {
  code: string;
  projectRoot?: string;
  authorizedImports?: string[];
}

/**
 * Code validation response
 */
export interface CodeValidationResponse {
  valid: boolean;
  vulnerabilities: SecurityVulnerability[];
  complianceScore?: number;
}

/**
 * Code execution request to Python sidecar
 */
export interface CodeExecutionRequest {
  projectRoot: string;
  code: string;
  authorizedImports?: string[];
  timeout?: number;
}

/**
 * Code execution response from Python sidecar
 */
export interface CodeExecutionResponse {
  success: boolean;
  result?: unknown;
  output?: string;
  error?: string;
  executionTime?: number;
}

/**
 * Security audit log entry
 */
export interface SecurityAuditEntry {
  timestamp: Date;
  action: string;
  path?: string;
  result: 'allowed' | 'blocked';
  reason?: string;
  agentId?: string;
}
