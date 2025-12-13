import * as path from 'path';
import * as fs from 'fs/promises';
import { Logger } from '@nestjs/common';
import { SecurityAuditEntry } from '../types/security.types';

/**
 * ProjectIsolation - TypeScript port
 * Ported from bt1zar_bt1_CLI/core/src/security/isolation.py
 *
 * Enforces strict project boundary isolation for security.
 * Prevents path traversal attacks and unauthorized file access.
 */
export class ProjectIsolation {
  private readonly logger = new Logger(ProjectIsolation.name);
  private readonly projectRoot: string;
  private readonly enableAudit: boolean;
  private readonly auditLog: SecurityAuditEntry[] = [];

  constructor(projectRoot: string, enableAudit = true) {
    this.projectRoot = path.resolve(projectRoot);
    this.enableAudit = enableAudit;

    this.logger.log(
      `Project isolation initialized: ${this.projectRoot} (audit: ${enableAudit})`,
    );
  }

  /**
   * Validate that a path is within the project boundary
   *
   * @param inputPath - Path to validate (relative or absolute)
   * @returns Resolved absolute path within project boundary
   * @throws Error if path traversal is detected
   */
  async validatePath(inputPath: string): Promise<string> {
    let target: string;

    try {
      // Handle both relative and absolute paths
      if (path.isAbsolute(inputPath)) {
        target = path.resolve(inputPath);
      } else {
        target = path.resolve(this.projectRoot, inputPath);
      }

      // Resolve symlinks if the path exists
      try {
        target = await fs.realpath(target);
      } catch {
        // Path doesn't exist yet, validate parent directory
        const parent = path.dirname(target);
        try {
          const resolvedParent = await fs.realpath(parent);
          target = path.join(resolvedParent, path.basename(target));
        } catch {
          // Parent also doesn't exist, use normalized path
          target = path.normalize(target);
        }
      }

      // Check if target is within project boundary
      if (!target.startsWith(this.projectRoot)) {
        const entry: SecurityAuditEntry = {
          timestamp: new Date(),
          action: 'path_validation',
          path: inputPath,
          result: 'blocked',
          reason: `Path traversal detected: resolves to ${target}`,
        };

        if (this.enableAudit) {
          this.auditLog.push(entry);
          this.logger.warn(
            `[SECURITY] Path traversal blocked: ${inputPath} -> ${target}`,
          );
        }

        throw new Error(`Path traversal detected: ${inputPath}`);
      }

      if (this.enableAudit) {
        this.auditLog.push({
          timestamp: new Date(),
          action: 'path_validation',
          path: inputPath,
          result: 'allowed',
        });
        this.logger.debug(`Path validated: ${inputPath} -> ${target}`);
      }

      return target;
    } catch (error) {
      if (this.enableAudit) {
        this.logger.error(`Path validation failed: ${inputPath}`, error);
      }
      throw error;
    }
  }

  /**
   * Check if a path is safe without throwing
   *
   * @param inputPath - Path to check
   * @returns True if path is within project boundary
   */
  async isSafePath(inputPath: string): Promise<boolean> {
    try {
      await this.validatePath(inputPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get path relative to project root
   *
   * @param inputPath - Path to convert
   * @returns Path relative to project root
   * @throws Error if path is outside project boundary
   */
  async getRelativePath(inputPath: string): Promise<string> {
    const validatedPath = await this.validatePath(inputPath);
    return path.relative(this.projectRoot, validatedPath);
  }

  /**
   * List all paths matching a glob pattern within project boundary
   *
   * @param pattern - Glob pattern to match
   * @returns Array of matching paths
   */
  async listAllowedPaths(pattern = '*'): Promise<string[]> {
    try {
      const { glob } = await import('glob');
      const matches = await glob(pattern, {
        cwd: this.projectRoot,
        absolute: true,
      });

      // Filter to ensure all paths are within boundary
      const safePaths: string[] = [];
      for (const match of matches) {
        if (await this.isSafePath(match)) {
          safePaths.push(match);
        }
      }

      if (this.enableAudit) {
        this.logger.debug(
          `Listed ${safePaths.length} paths matching pattern: ${pattern}`,
        );
      }

      return safePaths;
    } catch (error) {
      if (this.enableAudit) {
        this.logger.error(`Failed to list paths: ${pattern}`, error);
      }
      return [];
    }
  }

  /**
   * Get the project root directory
   */
  getProjectRoot(): string {
    return this.projectRoot;
  }

  /**
   * Get audit log entries
   */
  getAuditLog(): SecurityAuditEntry[] {
    return [...this.auditLog];
  }

  /**
   * Clear audit log
   */
  clearAuditLog(): void {
    this.auditLog.length = 0;
  }

  /**
   * Check if audit is enabled
   */
  isAuditEnabled(): boolean {
    return this.enableAudit;
  }
}

/**
 * MultiProjectIsolation - Manager for multiple project isolation instances
 * Ported from bt1zar_bt1_CLI/core/src/security/isolation.py
 */
export class MultiProjectIsolation {
  private readonly logger = new Logger(MultiProjectIsolation.name);
  private readonly instances = new Map<string, ProjectIsolation>();
  private readonly enableAudit: boolean;

  constructor(enableAudit = true) {
    this.enableAudit = enableAudit;
    this.logger.log(`Multi-project isolation manager initialized (audit: ${enableAudit})`);
  }

  /**
   * Create a new project isolation instance
   *
   * @param instanceId - Unique identifier for the instance
   * @param projectRoot - Root directory for the project
   * @returns ProjectIsolation instance
   */
  createInstance(instanceId: string, projectRoot: string): ProjectIsolation {
    if (this.instances.has(instanceId)) {
      this.logger.warn(`Instance already exists: ${instanceId}, returning existing`);
      return this.instances.get(instanceId)!;
    }

    const isolation = new ProjectIsolation(projectRoot, this.enableAudit);
    this.instances.set(instanceId, isolation);

    this.logger.log(
      `Created isolation instance: ${instanceId} -> ${projectRoot} (total: ${this.instances.size})`,
    );

    return isolation;
  }

  /**
   * Get an existing instance
   *
   * @param instanceId - Instance identifier
   * @returns ProjectIsolation instance or undefined
   */
  getInstance(instanceId: string): ProjectIsolation | undefined {
    return this.instances.get(instanceId);
  }

  /**
   * Remove an instance
   *
   * @param instanceId - Instance identifier
   * @returns True if removed, false if not found
   */
  removeInstance(instanceId: string): boolean {
    const removed = this.instances.delete(instanceId);
    if (removed) {
      this.logger.log(
        `Removed isolation instance: ${instanceId} (remaining: ${this.instances.size})`,
      );
    }
    return removed;
  }

  /**
   * List all instances
   *
   * @returns Map of instanceId to projectRoot
   */
  listInstances(): Map<string, string> {
    const result = new Map<string, string>();
    for (const [id, isolation] of this.instances) {
      result.set(id, isolation.getProjectRoot());
    }
    return result;
  }

  /**
   * Validate a path for a specific instance
   *
   * @param instanceId - Instance identifier
   * @param inputPath - Path to validate
   * @returns Validated path
   * @throws Error if instance not found or path invalid
   */
  async validateInstancePath(instanceId: string, inputPath: string): Promise<string> {
    const isolation = this.getInstance(instanceId);
    if (!isolation) {
      throw new Error(`Instance not found: ${instanceId}`);
    }
    return isolation.validatePath(inputPath);
  }

  /**
   * Get health status of all instances
   */
  async getHealthStatus(): Promise<{
    totalInstances: number;
    healthyInstances: number;
    instances: Record<string, { healthy: boolean; projectRoot: string; error?: string }>;
    overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  }> {
    let healthyCount = 0;
    const instanceStatus: Record<string, { healthy: boolean; projectRoot: string; error?: string }> = {};

    for (const [id, isolation] of this.instances) {
      try {
        const stats = await fs.stat(isolation.getProjectRoot());
        const healthy = stats.isDirectory();
        instanceStatus[id] = {
          healthy,
          projectRoot: isolation.getProjectRoot(),
        };
        if (healthy) healthyCount++;
      } catch (error) {
        instanceStatus[id] = {
          healthy: false,
          projectRoot: isolation.getProjectRoot(),
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }

    const total = this.instances.size;
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (healthyCount === 0 && total > 0) {
      overallStatus = 'unhealthy';
    } else if (healthyCount < total) {
      overallStatus = 'degraded';
    }

    return {
      totalInstances: total,
      healthyInstances: healthyCount,
      instances: instanceStatus,
      overallStatus,
    };
  }
}
