import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout, catchError } from 'rxjs';
import {
  PathValidationRequest,
  PathValidationResponse,
  CodeValidationRequest,
  CodeValidationResponse,
  CodeExecutionRequest,
  CodeExecutionResponse,
  SecurityVulnerability,
} from '../types/security.types';

/**
 * PythonSecurityBridge - HTTP bridge to Python sidecar
 *
 * This service communicates with the Python sidecar microservice
 * to leverage the proven Python security implementations:
 * - ProjectIsolation for path validation
 * - OWASP validator for vulnerability detection
 * - STRIDE validator for threat modeling
 * - SecurePythonExecutor for safe code execution
 */
@Injectable()
export class PythonSecurityBridge implements OnModuleInit {
  private readonly logger = new Logger(PythonSecurityBridge.name);
  private sidecarUrl: string;
  private readonly defaultTimeout = 30000; // 30 seconds

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.sidecarUrl =
      this.configService.get<string>('PYTHON_SIDECAR_URL') ||
      'http://localhost:8766';
  }

  async onModuleInit() {
    this.logger.log(`Python security bridge initialized: ${this.sidecarUrl}`);
    await this.checkHealth();
  }

  /**
   * Check if the Python sidecar is healthy
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.sidecarUrl}/health`).pipe(
          timeout(5000),
          catchError((error) => {
            this.logger.warn(`Python sidecar health check failed: ${error.message}`);
            throw error;
          }),
        ),
      );
      const healthy = response.data?.status === 'healthy';
      this.logger.log(`Python sidecar health: ${healthy ? 'OK' : 'UNHEALTHY'}`);
      return healthy;
    } catch {
      this.logger.warn('Python sidecar is not available');
      return false;
    }
  }

  /**
   * Validate a path using Python's ProjectIsolation
   *
   * @param projectRoot - The project root directory
   * @param path - The path to validate
   * @returns Validation result with resolved path
   */
  async validatePath(
    projectRoot: string,
    path: string,
  ): Promise<PathValidationResponse> {
    try {
      const request: PathValidationRequest = {
        projectRoot,
        path,
      };

      const response = await firstValueFrom(
        this.httpService
          .post<PathValidationResponse>(`${this.sidecarUrl}/validate/path`, request)
          .pipe(
            timeout(this.defaultTimeout),
            catchError((error) => {
              this.logger.error(`Path validation request failed: ${error.message}`);
              throw error;
            }),
          ),
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Path validation failed: ${error}`);
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Validate code for security vulnerabilities using OWASP/STRIDE
   *
   * @param code - The code to validate
   * @param projectRoot - Optional project root for context
   * @param authorizedImports - List of authorized imports
   * @returns Validation result with detected vulnerabilities
   */
  async validateCode(
    code: string,
    projectRoot?: string,
    authorizedImports?: string[],
  ): Promise<CodeValidationResponse> {
    try {
      const request: CodeValidationRequest = {
        code,
        projectRoot,
        authorizedImports,
      };

      const response = await firstValueFrom(
        this.httpService
          .post<CodeValidationResponse>(`${this.sidecarUrl}/validate/code`, request)
          .pipe(
            timeout(this.defaultTimeout),
            catchError((error) => {
              this.logger.error(`Code validation request failed: ${error.message}`);
              throw error;
            }),
          ),
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Code validation failed: ${error}`);
      return {
        valid: false,
        vulnerabilities: [
          {
            id: 'BRIDGE_ERROR',
            category: 'Bridge Error',
            severity: 'high',
            title: 'Security validation unavailable',
            description:
              error instanceof Error ? error.message : 'Unknown error',
          },
        ] as SecurityVulnerability[],
      };
    }
  }

  /**
   * Execute code securely using Python's SecurePythonExecutor
   *
   * @param projectRoot - The project root for isolation
   * @param code - The code to execute
   * @param authorizedImports - List of authorized imports
   * @param timeoutMs - Execution timeout in milliseconds
   * @returns Execution result
   */
  async executeSecurely(
    projectRoot: string,
    code: string,
    authorizedImports: string[] = [],
    timeoutMs: number = 60000,
  ): Promise<CodeExecutionResponse> {
    try {
      const request: CodeExecutionRequest = {
        projectRoot,
        code,
        authorizedImports,
        timeout: timeoutMs,
      };

      const response = await firstValueFrom(
        this.httpService
          .post<CodeExecutionResponse>(`${this.sidecarUrl}/execute`, request)
          .pipe(
            timeout(timeoutMs + 5000), // Add buffer for HTTP overhead
            catchError((error) => {
              this.logger.error(`Code execution request failed: ${error.message}`);
              throw error;
            }),
          ),
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Code execution failed: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Run OWASP validation on configuration
   *
   * @param config - Configuration object to validate
   * @returns Validation result
   */
  async validateOWASP(
    config: Record<string, unknown>,
  ): Promise<CodeValidationResponse> {
    try {
      const response = await firstValueFrom(
        this.httpService
          .post<CodeValidationResponse>(`${this.sidecarUrl}/validate/owasp`, {
            config,
          })
          .pipe(
            timeout(this.defaultTimeout),
            catchError((error) => {
              this.logger.error(`OWASP validation request failed: ${error.message}`);
              throw error;
            }),
          ),
      );

      return response.data;
    } catch (error) {
      this.logger.error(`OWASP validation failed: ${error}`);
      return {
        valid: false,
        vulnerabilities: [],
      };
    }
  }

  /**
   * Run STRIDE threat analysis
   *
   * @param component - Component to analyze
   * @param context - Analysis context
   * @returns Threat analysis result
   */
  async analyzeSTRIDE(
    component: string,
    context: Record<string, unknown>,
  ): Promise<CodeValidationResponse> {
    try {
      const response = await firstValueFrom(
        this.httpService
          .post<CodeValidationResponse>(`${this.sidecarUrl}/validate/stride`, {
            component,
            context,
          })
          .pipe(
            timeout(this.defaultTimeout),
            catchError((error) => {
              this.logger.error(`STRIDE analysis request failed: ${error.message}`);
              throw error;
            }),
          ),
      );

      return response.data;
    } catch (error) {
      this.logger.error(`STRIDE analysis failed: ${error}`);
      return {
        valid: false,
        vulnerabilities: [],
      };
    }
  }

  /**
   * Update the sidecar URL
   *
   * @param url - New sidecar URL
   */
  setSidecarUrl(url: string): void {
    this.sidecarUrl = url;
    this.logger.log(`Python sidecar URL updated: ${url}`);
  }

  /**
   * Get the current sidecar URL
   */
  getSidecarUrl(): string {
    return this.sidecarUrl;
  }
}
