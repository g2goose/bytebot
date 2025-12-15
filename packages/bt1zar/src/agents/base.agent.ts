import { Logger } from '@nestjs/common';
import {
  AgentCapability,
  AgentConfig,
  AgentMode,
  AgentRunResult,
  AgentStatus,
  AgentStep,
  ExecutorType,
  BT1Tool,
  TokenUsage,
} from '../types/agent.types';
import { ProjectIsolation } from '../security/project-isolation';

/**
 * BT1Agent - Base agent class
 * Ported from bt1zar_bt1_CLI/core/src/agents/base.py
 *
 * Abstract base class for all bt1zar agents. Provides common functionality
 * for task execution, status tracking, and capability management.
 */
export abstract class BT1Agent {
  protected readonly logger: Logger;
  protected readonly config: AgentConfig;
  protected readonly capabilities: Set<AgentCapability>;
  protected readonly tools: Map<string, BT1Tool> = new Map();
  protected readonly isolation?: ProjectIsolation;

  // Status tracking
  protected status: 'initialized' | 'running' | 'idle' | 'error' | 'stopped' = 'initialized';
  protected lastActivity: Date | null = null;
  protected runCount = 0;
  protected errorCount = 0;
  protected steps: AgentStep[] = [];

  constructor(config: AgentConfig, isolation?: ProjectIsolation) {
    this.config = config;
    this.capabilities = new Set(config.capabilities);
    this.isolation = isolation;
    this.logger = new Logger(`BT1Agent:${config.agentId}`);

    this.logger.log(
      `Agent initialized: ${config.agentId} with capabilities: ${[...this.capabilities].join(', ')}`,
    );
  }

  /**
   * Get agent ID
   */
  get agentId(): string {
    return this.config.agentId;
  }

  /**
   * Get agent mode
   */
  get mode(): AgentMode {
    return this.config.mode;
  }

  /**
   * Get executor type
   */
  get executorType(): ExecutorType {
    return this.config.executorType;
  }

  /**
   * Check if agent has a specific capability
   */
  hasCapability(capability: AgentCapability): boolean {
    return this.capabilities.has(capability);
  }

  /**
   * Get all capabilities
   */
  getCapabilities(): AgentCapability[] {
    return [...this.capabilities];
  }

  /**
   * Register a tool
   */
  registerTool(tool: BT1Tool): void {
    this.tools.set(tool.name, tool);
    this.logger.debug(`Tool registered: ${tool.name}`);
  }

  /**
   * Get registered tools
   */
  getTools(): BT1Tool[] {
    return [...this.tools.values()];
  }

  /**
   * Get agent status
   */
  getStatus(): AgentStatus {
    return {
      agentId: this.config.agentId,
      status: this.status,
      lastActivity: this.lastActivity,
      runCount: this.runCount,
      errorCount: this.errorCount,
      capabilities: this.getCapabilities(),
      executorType: this.config.executorType,
      mode: this.config.mode,
    };
  }

  /**
   * Run a task
   * Must be implemented by subclasses
   */
  abstract run(task: string): Promise<AgentRunResult>;

  /**
   * Execute a tool by name
   */
  protected async executeTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    this.addStep({
      type: 'action',
      content: `Executing tool: ${toolName}`,
      toolUsed: toolName,
    });

    // Tool execution would be implemented here
    // For now, this is a placeholder
    return { toolName, args, status: 'executed' };
  }

  /**
   * Add an execution step
   */
  protected addStep(
    step: Omit<AgentStep, 'timestamp'>,
  ): void {
    this.steps.push({
      ...step,
      timestamp: new Date(),
    });
  }

  /**
   * Clear execution steps
   */
  protected clearSteps(): void {
    this.steps = [];
  }

  /**
   * Get execution steps
   */
  getSteps(): AgentStep[] {
    return [...this.steps];
  }

  /**
   * Update agent status
   */
  protected setStatus(
    status: 'initialized' | 'running' | 'idle' | 'error' | 'stopped',
  ): void {
    this.status = status;
    this.lastActivity = new Date();
  }

  /**
   * Record a successful run
   */
  protected recordSuccess(): void {
    this.runCount++;
    this.setStatus('idle');
  }

  /**
   * Record a failed run
   */
  protected recordError(error: Error): void {
    this.errorCount++;
    this.setStatus('error');
    this.logger.error(`Agent error: ${error.message}`, error.stack);
  }

  /**
   * Create a result object
   */
  protected createResult<T>(
    success: boolean,
    result?: T,
    error?: string,
    tokenUsage?: TokenUsage,
  ): AgentRunResult<T> {
    return {
      success,
      result,
      error,
      steps: this.getSteps(),
      metrics: {
        duration: this.calculateDuration(),
        tokenUsage: tokenUsage || { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      },
    };
  }

  /**
   * Calculate execution duration from steps
   */
  private calculateDuration(): number {
    if (this.steps.length < 2) return 0;
    const first = this.steps[0].timestamp.getTime();
    const last = this.steps[this.steps.length - 1].timestamp.getTime();
    return last - first;
  }

  /**
   * Cleanup agent resources
   */
  async cleanup(): Promise<void> {
    this.setStatus('stopped');
    this.clearSteps();
    this.logger.log(`Agent cleanup complete: ${this.agentId}`);
  }
}

/**
 * ManagedAgent - Agent that can be managed by an orchestrator
 * Extends BT1Agent with delegation support
 */
export abstract class ManagedAgent extends BT1Agent {
  protected parentAgentId?: string;

  /**
   * Set the parent agent (orchestrator)
   */
  setParent(parentId: string): void {
    this.parentAgentId = parentId;
  }

  /**
   * Get description for orchestrator delegation
   */
  abstract getDescription(): string;

  /**
   * Get the agent name for delegation
   */
  abstract getName(): string;
}
