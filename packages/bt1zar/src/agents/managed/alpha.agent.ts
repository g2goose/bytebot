import { Logger } from '@nestjs/common';
import { ManagedAgent } from '../base.agent';
import {
  AgentCapability,
  AgentConfig,
  AgentMode,
  AgentRunResult,
} from '../../types/agent.types';
import { ProjectIsolation } from '../../security/project-isolation';
import { CodeAnalysisResultDto, CodeMetricsDto } from '../../models/code-analysis.dto';

/**
 * AlphaManagedAgent - Analysis, transformation, and reasoning agent
 * Ported from bt1zar_bt1_CLI/core/src/agents/managed/alpha.py
 *
 * Provides code analysis, text analysis, pattern extraction, and reasoning capabilities.
 */
export class AlphaManagedAgent extends ManagedAgent {
  protected readonly logger = new Logger(AlphaManagedAgent.name);

  constructor(isolation?: ProjectIsolation) {
    const config: AgentConfig = {
      agentId: 'alpha_agent',
      capabilities: [
        AgentCapability.ANALYZE,
        AgentCapability.TRANSFORM,
        AgentCapability.OPTIMIZE,
        AgentCapability.REASON,
      ],
      executorType: 'local',
      mode: AgentMode.CODE_GENERATION,
    };

    super(config, isolation);
    this.registerTools();
  }

  getName(): string {
    return 'alpha';
  }

  getDescription(): string {
    return 'Analysis, transformation, and reasoning agent for code and text';
  }

  private registerTools(): void {
    this.registerTool({
      name: 'analyze_code',
      description: 'Analyze code structure, complexity, and patterns',
      inputs: {
        code: { type: 'string', description: 'Code to analyze', required: true },
        language: { type: 'string', description: 'Programming language', required: false },
      },
      outputType: 'object',
    });

    this.registerTool({
      name: 'analyze_text',
      description: 'Analyze text for statistics and patterns',
      inputs: {
        text: { type: 'string', description: 'Text to analyze', required: true },
      },
      outputType: 'object',
    });

    this.registerTool({
      name: 'transform_text',
      description: 'Transform text (case, normalization)',
      inputs: {
        text: { type: 'string', description: 'Text to transform', required: true },
        operation: {
          type: 'string',
          description: 'Operation (uppercase, lowercase, capitalize, normalize)',
          required: true,
        },
      },
      outputType: 'string',
    });

    this.registerTool({
      name: 'extract_patterns',
      description: 'Extract patterns from text (emails, URLs, numbers)',
      inputs: {
        text: { type: 'string', description: 'Text to extract from', required: true },
        patternType: {
          type: 'string',
          description: 'Pattern type (email, url, number, date)',
          required: true,
        },
      },
      outputType: 'array',
    });

    this.registerTool({
      name: 'reasoning',
      description: 'Apply reasoning framework to problem',
      inputs: {
        problem: { type: 'string', description: 'Problem to reason about', required: true },
        framework: {
          type: 'string',
          description: 'Framework (deductive, inductive, causal, analogical)',
          required: false,
        },
      },
      outputType: 'object',
    });
  }

  async run(task: string): Promise<AgentRunResult<CodeAnalysisResultDto>> {
    this.setStatus('running');
    this.clearSteps();

    try {
      this.addStep({ type: 'thought', content: `Analyzing task: ${task}` });

      const taskLower = task.toLowerCase();

      if (taskLower.includes('code') || taskLower.includes('complexity')) {
        // Extract code from task or use task itself
        const code = this.extractCode(task);
        const result = await this.analyzeCode(code, this.detectLanguage(code));
        this.recordSuccess();
        return this.createResult(true, result);
      }

      if (taskLower.includes('pattern') || taskLower.includes('extract')) {
        const patterns = await this.extractPatterns(task, 'all');
        const result = new CodeAnalysisResultDto({
          summary: `Extracted ${patterns.length} patterns`,
          complexity: 'low',
          issues: [],
          suggestions: [],
          metrics: new CodeMetricsDto({ linesOfCode: task.split('\n').length }),
        });
        this.recordSuccess();
        return this.createResult(true, result);
      }

      // Default: analyze as text
      const result = await this.analyzeText(task);
      this.recordSuccess();
      return this.createResult(true, result);
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Unknown error');
      this.recordError(err);
      return this.createResult(false, undefined, err.message);
    }
  }

  /**
   * Analyze code structure and complexity
   */
  async analyzeCode(code: string, language?: string): Promise<CodeAnalysisResultDto> {
    this.addStep({ type: 'action', content: 'Analyzing code structure', toolUsed: 'analyze_code' });

    const lines = code.split('\n');
    const nonEmptyLines = lines.filter((l) => l.trim().length > 0);

    // Simple complexity analysis
    const functionMatches = code.match(/function\s+\w+|def\s+\w+|async\s+function|\w+\s*=\s*\([^)]*\)\s*=>/g) || [];
    const classMatches = code.match(/class\s+\w+/g) || [];
    const importMatches = code.match(/import\s+|from\s+\w+\s+import|require\(/g) || [];

    // Estimate cyclomatic complexity based on control flow statements
    const controlFlow = (code.match(/if\s*\(|else\s*{|for\s*\(|while\s*\(|switch\s*\(|catch\s*\(/g) || []).length;
    const cyclomaticComplexity = controlFlow + 1;

    let complexity: 'low' | 'medium' | 'high';
    if (cyclomaticComplexity <= 5) {
      complexity = 'low';
    } else if (cyclomaticComplexity <= 10) {
      complexity = 'medium';
    } else {
      complexity = 'high';
    }

    // Detect issues
    const issues: string[] = [];
    if (nonEmptyLines.length > 300) {
      issues.push('File is quite long, consider splitting');
    }
    if (cyclomaticComplexity > 10) {
      issues.push('High cyclomatic complexity, consider refactoring');
    }
    if (functionMatches.length > 20) {
      issues.push('Many functions in one file, consider modularization');
    }

    // Generate suggestions
    const suggestions: string[] = [];
    if (complexity !== 'low') {
      suggestions.push('Consider breaking down complex functions');
    }
    if (!code.includes('//') && !code.includes('#') && !code.includes('"""')) {
      suggestions.push('Add documentation comments');
    }

    const metrics = new CodeMetricsDto({
      linesOfCode: lines.length,
      cyclomaticComplexity,
      functionCount: functionMatches.length,
      classCount: classMatches.length,
      importCount: importMatches.length,
    });

    this.addStep({
      type: 'observation',
      content: `Complexity: ${complexity}, ${functionMatches.length} functions, ${classMatches.length} classes`,
    });

    return new CodeAnalysisResultDto({
      summary: `Analyzed ${lines.length} lines of ${language || 'code'} with ${complexity} complexity`,
      complexity,
      issues,
      suggestions,
      metrics,
      language: language || this.detectLanguage(code),
    });
  }

  /**
   * Analyze text for statistics
   */
  async analyzeText(text: string): Promise<CodeAnalysisResultDto> {
    this.addStep({ type: 'action', content: 'Analyzing text', toolUsed: 'analyze_text' });

    const words = text.split(/\s+/).filter((w) => w.length > 0);
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0);

    const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / (words.length || 1);

    this.addStep({
      type: 'observation',
      content: `${words.length} words, ${sentences.length} sentences, ${paragraphs.length} paragraphs`,
    });

    return new CodeAnalysisResultDto({
      summary: `Text analysis: ${words.length} words, ${sentences.length} sentences`,
      complexity: words.length > 500 ? 'high' : words.length > 100 ? 'medium' : 'low',
      issues: [],
      suggestions: [],
      metrics: new CodeMetricsDto({
        linesOfCode: paragraphs.length,
        functionCount: sentences.length,
        classCount: Math.round(avgWordLength * 10) / 10,
      }),
    });
  }

  /**
   * Extract patterns from text
   */
  async extractPatterns(text: string, patternType: string): Promise<string[]> {
    this.addStep({ type: 'action', content: `Extracting ${patternType} patterns`, toolUsed: 'extract_patterns' });

    const patterns: string[] = [];

    if (patternType === 'email' || patternType === 'all') {
      const emails = text.match(/[\w.-]+@[\w.-]+\.\w+/g) || [];
      patterns.push(...emails);
    }

    if (patternType === 'url' || patternType === 'all') {
      const urls = text.match(/https?:\/\/[^\s]+/g) || [];
      patterns.push(...urls);
    }

    if (patternType === 'number' || patternType === 'all') {
      const numbers = text.match(/\b\d+(?:\.\d+)?\b/g) || [];
      patterns.push(...numbers);
    }

    if (patternType === 'date' || patternType === 'all') {
      const dates = text.match(/\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/g) || [];
      patterns.push(...dates);
    }

    this.addStep({ type: 'observation', content: `Found ${patterns.length} patterns` });

    return patterns;
  }

  /**
   * Transform text
   */
  async transformText(text: string, operation: string): Promise<string> {
    this.addStep({ type: 'action', content: `Transforming text: ${operation}`, toolUsed: 'transform_text' });

    let result: string;
    switch (operation.toLowerCase()) {
      case 'uppercase':
        result = text.toUpperCase();
        break;
      case 'lowercase':
        result = text.toLowerCase();
        break;
      case 'capitalize':
        result = text
          .split(' ')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(' ');
        break;
      case 'normalize':
        result = text.normalize('NFC').replace(/\s+/g, ' ').trim();
        break;
      default:
        result = text;
    }

    return result;
  }

  // Helper methods
  private extractCode(task: string): string {
    // Look for code blocks
    const codeBlockMatch = task.match(/```[\w]*\n([\s\S]*?)```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1];
    }
    return task;
  }

  private detectLanguage(code: string): string {
    if (code.includes('def ') || code.includes('import ')) return 'python';
    if (code.includes('function ') || code.includes('const ') || code.includes('let ')) return 'javascript';
    if (code.includes('interface ') || code.includes(': string') || code.includes(': number')) return 'typescript';
    if (code.includes('fn ') || code.includes('let mut')) return 'rust';
    if (code.includes('func ') || code.includes('package ')) return 'go';
    return 'unknown';
  }
}
