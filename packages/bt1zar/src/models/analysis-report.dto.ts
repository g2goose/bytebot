import {
  IsString,
  IsArray,
  IsNumber,
  IsOptional,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Report section DTO
 */
export class ReportSectionDto {
  @IsString()
  title: string;

  @IsString()
  content: string;

  @IsOptional()
  @IsNumber()
  order?: number;

  constructor(partial: Partial<ReportSectionDto>) {
    Object.assign(this, partial);
  }
}

/**
 * AnalysisReport DTO
 * Ported from bt1zar_bt1_CLI/core/src/models/outputs.py
 *
 * Comprehensive analysis report with executive summary, findings, and recommendations
 */
export class AnalysisReportDto {
  @IsString()
  title: string;

  @IsString()
  executiveSummary: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReportSectionDto)
  sections: ReportSectionDto[];

  @IsArray()
  @IsString({ each: true })
  findings: string[];

  @IsArray()
  @IsString({ each: true })
  recommendations: string[];

  @IsNumber()
  @Min(0)
  @Max(1)
  confidence: number;

  @IsOptional()
  @IsString()
  generatedAt?: string;

  @IsOptional()
  @IsString()
  projectRoot?: string;

  constructor(partial: Partial<AnalysisReportDto>) {
    Object.assign(this, partial);
  }
}

/**
 * ValidationResult DTO
 * Ported from bt1zar_bt1_CLI/core/src/models/outputs.py
 *
 * Validation operation result with errors and warnings
 */
export class ValidationResultDto {
  @IsOptional()
  valid: boolean;

  @IsArray()
  @IsString({ each: true })
  errors: string[];

  @IsArray()
  @IsString({ each: true })
  warnings: string[];

  @IsNumber()
  validatedItems: number;

  @IsNumber()
  passedItems: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  passRate?: number;

  constructor(partial: Partial<ValidationResultDto>) {
    Object.assign(this, partial);
  }
}
