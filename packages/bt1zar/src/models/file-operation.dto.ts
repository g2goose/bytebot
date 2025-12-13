import {
  IsString,
  IsBoolean,
  IsArray,
  IsIn,
  IsOptional,
  IsNumber,
} from 'class-validator';

/**
 * File operation types
 */
export type FileOperationType = 'read' | 'write' | 'list' | 'delete' | 'move' | 'copy';

/**
 * FileOperationResult DTO
 * Ported from bt1zar_bt1_CLI/core/src/models/outputs.py
 *
 * Result of file operations with success status and details
 */
export class FileOperationResultDto {
  @IsBoolean()
  success: boolean;

  @IsString()
  path: string;

  @IsString()
  @IsIn(['read', 'write', 'list', 'delete', 'move', 'copy'])
  operation: FileOperationType;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  error?: string;

  @IsArray()
  @IsString({ each: true })
  filesAffected: string[];

  @IsOptional()
  @IsNumber()
  bytesProcessed?: number;

  constructor(partial: Partial<FileOperationResultDto>) {
    Object.assign(this, partial);
  }
}

/**
 * File info DTO
 */
export class FileInfoDto {
  @IsString()
  path: string;

  @IsString()
  name: string;

  @IsNumber()
  size: number;

  @IsString()
  modified: string;

  @IsBoolean()
  isDirectory: boolean;

  @IsOptional()
  @IsString()
  extension?: string;

  constructor(partial: Partial<FileInfoDto>) {
    Object.assign(this, partial);
  }
}

/**
 * File list result DTO
 */
export class FileListResultDto {
  @IsBoolean()
  success: boolean;

  @IsString()
  directory: string;

  @IsArray()
  files: FileInfoDto[];

  @IsNumber()
  totalCount: number;

  @IsOptional()
  @IsString()
  error?: string;

  constructor(partial: Partial<FileListResultDto>) {
    Object.assign(this, partial);
  }
}
