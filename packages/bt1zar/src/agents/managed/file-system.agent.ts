import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from '@nestjs/common';
import { ManagedAgent } from '../base.agent';
import {
  AgentCapability,
  AgentConfig,
  AgentMode,
  AgentRunResult,
} from '../../types/agent.types';
import { ProjectIsolation } from '../../security/project-isolation';
import {
  FileOperationResultDto,
  FileInfoDto,
  FileListResultDto,
} from '../../models/file-operation.dto';

/**
 * FileSystemManagedAgent - Secure file operations agent
 * Ported from bt1zar_bt1_CLI/core/src/agents/managed/file_system.py
 *
 * Provides secure file operations with ProjectIsolation boundary enforcement.
 */
export class FileSystemManagedAgent extends ManagedAgent {
  protected readonly logger = new Logger(FileSystemManagedAgent.name);

  constructor(isolation: ProjectIsolation) {
    const config: AgentConfig = {
      agentId: 'file_system_agent',
      capabilities: [
        AgentCapability.FILE_READ,
        AgentCapability.FILE_WRITE,
        AgentCapability.FILE_LIST,
        AgentCapability.FILE_VALIDATE,
      ],
      executorType: 'local',
      mode: AgentMode.CODE_GENERATION,
    };

    super(config, isolation);
    this.registerTools();
  }

  getName(): string {
    return 'file_system';
  }

  getDescription(): string {
    return 'Secure file operations agent with path validation and isolation';
  }

  private registerTools(): void {
    this.registerTool({
      name: 'read_file',
      description: 'Read file contents with path validation',
      inputs: {
        path: { type: 'string', description: 'File path to read', required: true },
      },
      outputType: 'string',
    });

    this.registerTool({
      name: 'write_file',
      description: 'Write content to file with path validation',
      inputs: {
        path: { type: 'string', description: 'File path to write', required: true },
        content: { type: 'string', description: 'Content to write', required: true },
      },
      outputType: 'object',
    });

    this.registerTool({
      name: 'list_files',
      description: 'List files in directory with glob pattern',
      inputs: {
        pattern: { type: 'string', description: 'Glob pattern (e.g., "*.ts")', required: true },
        directory: { type: 'string', description: 'Directory to search', required: false },
      },
      outputType: 'array',
    });

    this.registerTool({
      name: 'file_exists',
      description: 'Check if file exists',
      inputs: {
        path: { type: 'string', description: 'File path to check', required: true },
      },
      outputType: 'boolean',
    });

    this.registerTool({
      name: 'get_file_info',
      description: 'Get file metadata',
      inputs: {
        path: { type: 'string', description: 'File path', required: true },
      },
      outputType: 'object',
    });
  }

  async run(task: string): Promise<AgentRunResult<FileOperationResultDto | FileListResultDto>> {
    this.setStatus('running');
    this.clearSteps();

    try {
      this.addStep({ type: 'thought', content: `Analyzing file task: ${task}` });

      // Parse task to determine operation
      const taskLower = task.toLowerCase();
      let result: FileOperationResultDto | FileListResultDto;

      if (taskLower.includes('read')) {
        const filePath = this.extractPath(task);
        result = await this.readFile(filePath);
      } else if (taskLower.includes('write')) {
        const { path: filePath, content } = this.extractWriteParams(task);
        result = await this.writeFile(filePath, content);
      } else if (taskLower.includes('list')) {
        const pattern = this.extractPattern(task);
        result = await this.listFiles(pattern);
      } else if (taskLower.includes('exists') || taskLower.includes('check')) {
        const filePath = this.extractPath(task);
        const exists = await this.fileExists(filePath);
        result = new FileOperationResultDto({
          success: true,
          path: filePath,
          operation: 'read',
          content: exists ? 'File exists' : 'File does not exist',
          filesAffected: [],
        });
      } else {
        // Default: list files
        result = await this.listFiles('*');
      }

      this.recordSuccess();
      return this.createResult(true, result);
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Unknown error');
      this.recordError(err);
      return this.createResult(false, undefined, err.message);
    }
  }

  /**
   * Read file contents
   */
  async readFile(filePath: string): Promise<FileOperationResultDto> {
    if (!this.isolation) {
      throw new Error('No isolation configured');
    }

    this.addStep({ type: 'action', content: `Reading file: ${filePath}`, toolUsed: 'read_file' });

    const validatedPath = await this.isolation.validatePath(filePath);
    const content = await fs.readFile(validatedPath, 'utf-8');

    this.addStep({ type: 'observation', content: `Read ${content.length} characters` });

    return new FileOperationResultDto({
      success: true,
      path: validatedPath,
      operation: 'read',
      content,
      filesAffected: [validatedPath],
      bytesProcessed: Buffer.byteLength(content, 'utf-8'),
    });
  }

  /**
   * Write file contents
   */
  async writeFile(filePath: string, content: string): Promise<FileOperationResultDto> {
    if (!this.isolation) {
      throw new Error('No isolation configured');
    }

    this.addStep({ type: 'action', content: `Writing file: ${filePath}`, toolUsed: 'write_file' });

    const validatedPath = await this.isolation.validatePath(filePath);

    // Ensure directory exists
    const dir = path.dirname(validatedPath);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(validatedPath, content, 'utf-8');

    this.addStep({ type: 'observation', content: `Wrote ${content.length} characters` });

    return new FileOperationResultDto({
      success: true,
      path: validatedPath,
      operation: 'write',
      filesAffected: [validatedPath],
      bytesProcessed: Buffer.byteLength(content, 'utf-8'),
    });
  }

  /**
   * List files matching pattern
   */
  async listFiles(pattern: string, directory?: string): Promise<FileListResultDto> {
    if (!this.isolation) {
      throw new Error('No isolation configured');
    }

    this.addStep({ type: 'action', content: `Listing files: ${pattern}`, toolUsed: 'list_files' });

    const baseDir = directory
      ? await this.isolation.validatePath(directory)
      : this.isolation.getProjectRoot();

    const { glob } = await import('glob');
    const matches = await glob(pattern, { cwd: baseDir, absolute: true });

    const files: FileInfoDto[] = [];
    for (const match of matches) {
      try {
        const stats = await fs.stat(match);
        files.push(
          new FileInfoDto({
            path: match,
            name: path.basename(match),
            size: stats.size,
            modified: stats.mtime.toISOString(),
            isDirectory: stats.isDirectory(),
            extension: path.extname(match) || undefined,
          }),
        );
      } catch {
        // Skip files that can't be stat'd
      }
    }

    this.addStep({ type: 'observation', content: `Found ${files.length} files` });

    return new FileListResultDto({
      success: true,
      directory: baseDir,
      files,
      totalCount: files.length,
    });
  }

  /**
   * Check if file exists
   */
  async fileExists(filePath: string): Promise<boolean> {
    if (!this.isolation) {
      throw new Error('No isolation configured');
    }

    try {
      const validatedPath = await this.isolation.validatePath(filePath);
      await fs.access(validatedPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file info
   */
  async getFileInfo(filePath: string): Promise<FileInfoDto> {
    if (!this.isolation) {
      throw new Error('No isolation configured');
    }

    const validatedPath = await this.isolation.validatePath(filePath);
    const stats = await fs.stat(validatedPath);

    return new FileInfoDto({
      path: validatedPath,
      name: path.basename(validatedPath),
      size: stats.size,
      modified: stats.mtime.toISOString(),
      isDirectory: stats.isDirectory(),
      extension: path.extname(validatedPath) || undefined,
    });
  }

  // Helper methods
  private extractPath(task: string): string {
    // Simple extraction - in production would use NLP
    const match = task.match(/["']([^"']+)["']|(\S+\.\w+)/);
    return match ? (match[1] || match[2]) : '.';
  }

  private extractPattern(task: string): string {
    const match = task.match(/["']([^"']+)["']|\*\.\w+/);
    return match ? (match[1] || match[0]) : '*';
  }

  private extractWriteParams(task: string): { path: string; content: string } {
    // Simple extraction - in production would use more sophisticated parsing
    const pathMatch = task.match(/to\s+["']?([^"'\s]+)["']?/i);
    const contentMatch = task.match(/content[:\s]+["']([^"']+)["']/i);
    return {
      path: pathMatch ? pathMatch[1] : 'output.txt',
      content: contentMatch ? contentMatch[1] : '',
    };
  }
}
