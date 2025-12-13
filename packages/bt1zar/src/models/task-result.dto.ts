import {
  IsString,
  IsNumber,
  IsArray,
  Min,
  Max,
  IsOptional,
} from 'class-validator';

/**
 * TaskResult DTO
 * Ported from bt1zar_bt1_CLI/core/src/models/outputs.py
 *
 * General-purpose task execution result with structured output
 */
export class TaskResultDto {
  @IsString()
  answer: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  confidence: number;

  @IsArray()
  @IsString({ each: true })
  stepsTaken: string[];

  @IsArray()
  @IsString({ each: true })
  sources: string[];

  @IsOptional()
  @IsNumber()
  executionTimeMs?: number;

  constructor(partial: Partial<TaskResultDto>) {
    Object.assign(this, partial);
  }
}
