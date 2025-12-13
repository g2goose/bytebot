import {
  IsString,
  IsArray,
  IsIn,
  IsOptional,
  IsNumber,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Code complexity levels
 */
export type ComplexityLevel = 'low' | 'medium' | 'high';

/**
 * Code metrics
 */
export class CodeMetricsDto {
  @IsOptional()
  @IsNumber()
  linesOfCode?: number;

  @IsOptional()
  @IsNumber()
  cyclomaticComplexity?: number;

  @IsOptional()
  @IsNumber()
  functionCount?: number;

  @IsOptional()
  @IsNumber()
  classCount?: number;

  @IsOptional()
  @IsNumber()
  importCount?: number;

  @IsOptional()
  @IsNumber()
  testCoverage?: number;

  constructor(partial: Partial<CodeMetricsDto>) {
    Object.assign(this, partial);
  }
}

/**
 * CodeAnalysisResult DTO
 * Ported from bt1zar_bt1_CLI/core/src/models/outputs.py
 *
 * Code analysis result with complexity assessment, issues, and suggestions
 */
export class CodeAnalysisResultDto {
  @IsString()
  summary: string;

  @IsString()
  @IsIn(['low', 'medium', 'high'])
  complexity: ComplexityLevel;

  @IsArray()
  @IsString({ each: true })
  issues: string[];

  @IsArray()
  @IsString({ each: true })
  suggestions: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => CodeMetricsDto)
  metrics?: CodeMetricsDto;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dependencies?: string[];

  @IsOptional()
  @IsString()
  language?: string;

  constructor(partial: Partial<CodeAnalysisResultDto>) {
    Object.assign(this, partial);
  }
}
