import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AgentCapability,
  AgentConfig,
  AgentMode,
  AgentRunResult,
  ExecuteWorkflowRequest,
  WorkflowExecutionEvent,
  BT1TaskStatus,
} from '../types/agent.types';
import { BT1Agent, ManagedAgent } from './base.agent';
import { ProjectIsolation, MultiProjectIsolation } from '../security/project-isolation';
import { PythonSecurityBridge } from '../security/python-bridge.service';
import { TaskResultDto } from '../models/task-result.dto';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * OrchestratorService - Main orchestration service
 * Ported from bt1zar_bt1_CLI/core/src/agents/primary/orchestrator.py
 *
 * Coordinates task execution across managed agents and handles
 * workflow execution for both code generation and desktop automation modes.
 */
@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);
  private readonly managedAgents = new Map<string, ManagedAgent>();
  private readonly activeRuns = new Map<string, { task: string; status: BT1TaskStatus; startTime: Date }>();
  private readonly multiIsolation: MultiProjectIsolation;

  constructor(
    private readonly configService: ConfigService,
    private readonly pythonBridge: PythonSecurityBridge,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.multiIsolation = new MultiProjectIsolation(true);
    this.logger.log('OrchestratorService initialized');
  }

  /**
   * Register a managed agent
   */
  registerAgent(agent: ManagedAgent): void {
    this.managedAgents.set(agent.getName(), agent);
    agent.setParent('orchestrator');
    this.logger.log(`Registered managed agent: ${agent.getName()}`);
  }

  /**
   * Get a managed agent by name
   */
  getAgent(name: string): ManagedAgent | undefined {
    return this.managedAgents.get(name);
  }

  /**
   * List all managed agents
   */
  listAgents(): { name: string; description: string; capabilities: AgentCapability[] }[] {
    return [...this.managedAgents.values()].map((agent) => ({
      name: agent.getName(),
      description: agent.getDescription(),
      capabilities: agent.getCapabilities(),
    }));
  }

  /**
   * Execute a workflow
   */
  async executeWorkflow(request: ExecuteWorkflowRequest): Promise<string> {
    const runId = uuidv4();
    const startTime = new Date();

    this.activeRuns.set(runId, {
      task: request.task,
      status: BT1TaskStatus.RUNNING,
      startTime,
    });

    // Emit start event
    this.emitEvent({
      type: 'start',
      runId,
      message: `Starting workflow: ${request.task.substring(0, 50)}...`,
      timestamp: startTime,
    });

    // Execute asynchronously
    this.runWorkflow(runId, request).catch((error) => {
      this.logger.error(`Workflow ${runId} failed: ${error.message}`);
    });

    return runId;
  }

  /**
   * Run the workflow (async)
   */
  private async runWorkflow(
    runId: string,
    request: ExecuteWorkflowRequest,
  ): Promise<void> {
    try {
      const mode = request.mode || AgentMode.CODE_GENERATION;
      const projectRoot = request.projectRoot || process.cwd();

      // Create isolation instance for this workflow
      const isolation = this.multiIsolation.createInstance(runId, projectRoot);

      this.emitEvent({
        type: 'progress',
        runId,
        message: `Mode: ${mode}, Project: ${projectRoot}`,
        progress: 10,
        timestamp: new Date(),
      });

      let result: TaskResultDto;

      switch (mode) {
        case AgentMode.CODE_GENERATION:
          result = await this.executeCodeGeneration(runId, request, isolation);
          break;

        case AgentMode.DESKTOP_AUTOMATION:
          result = await this.executeDesktopAutomation(runId, request);
          break;

        case AgentMode.HYBRID:
          result = await this.executeHybrid(runId, request, isolation);
          break;

        default:
          throw new Error(`Unknown mode: ${mode}`);
      }

      // Update run status
      const run = this.activeRuns.get(runId);
      if (run) {
        run.status = BT1TaskStatus.COMPLETED;
      }

      // Emit completion event
      this.emitEvent({
        type: 'completed',
        runId,
        result,
        timestamp: new Date(),
      });

      // Cleanup isolation
      this.multiIsolation.removeInstance(runId);

    } catch (error) {
      const run = this.activeRuns.get(runId);
      if (run) {
        run.status = BT1TaskStatus.FAILED;
      }

      this.emitEvent({
        type: 'failed',
        runId,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      });

      this.multiIsolation.removeInstance(runId);
    }
  }

  /**
   * Execute code generation mode
   */
  private async executeCodeGeneration(
    runId: string,
    request: ExecuteWorkflowRequest,
    isolation: ProjectIsolation,
  ): Promise<TaskResultDto> {
    this.emitEvent({
      type: 'progress',
      runId,
      message: 'Validating code execution request...',
      progress: 20,
      timestamp: new Date(),
    });

    // Validate with Python sidecar
    const validation = await this.pythonBridge.validateCode(
      request.task,
      isolation.getProjectRoot(),
    );

    if (!validation.valid && validation.vulnerabilities.length > 0) {
      const criticalVulns = validation.vulnerabilities.filter(
        (v) => v.severity === 'critical' || v.severity === 'high',
      );
      if (criticalVulns.length > 0) {
        throw new Error(
          `Security validation failed: ${criticalVulns.map((v) => v.title).join(', ')}`,
        );
      }
    }

    this.emitEvent({
      type: 'progress',
      runId,
      message: 'Executing code generation task...',
      progress: 50,
      timestamp: new Date(),
    });

    // Delegate to appropriate managed agent based on task
    const agent = this.selectAgent(request.task);
    if (agent) {
      const agentResult = await agent.run(request.task);

      return new TaskResultDto({
        answer: agentResult.success
          ? JSON.stringify(agentResult.result)
          : `Error: ${agentResult.error}`,
        confidence: agentResult.success ? 0.9 : 0.1,
        stepsTaken: agentResult.steps.map((s) => s.content),
        sources: [],
        executionTimeMs: agentResult.metrics.duration,
      });
    }

    // Fallback: execute via Python bridge
    const execResult = await this.pythonBridge.executeSecurely(
      isolation.getProjectRoot(),
      request.task,
      ['os', 'json', 'pathlib'],
      request.timeout || 60000,
    );

    return new TaskResultDto({
      answer: execResult.success
        ? String(execResult.result || execResult.output)
        : `Error: ${execResult.error}`,
      confidence: execResult.success ? 0.85 : 0.1,
      stepsTaken: ['Code generation via Python bridge'],
      sources: [],
      executionTimeMs: execResult.executionTime,
    });
  }

  /**
   * Execute desktop automation mode
   * Delegates to bytebot's existing desktop tools
   */
  private async executeDesktopAutomation(
    runId: string,
    request: ExecuteWorkflowRequest,
  ): Promise<TaskResultDto> {
    this.emitEvent({
      type: 'progress',
      runId,
      message: 'Executing desktop automation task...',
      progress: 50,
      timestamp: new Date(),
    });

    // Desktop automation is handled by bytebot's AgentProcessor
    // This service just coordinates and validates
    return new TaskResultDto({
      answer: 'Desktop automation task delegated to bytebot agent',
      confidence: 0.9,
      stepsTaken: ['Delegated to bytebot desktop automation'],
      sources: [],
    });
  }

  /**
   * Execute hybrid mode (both code generation and desktop automation)
   */
  private async executeHybrid(
    runId: string,
    request: ExecuteWorkflowRequest,
    isolation: ProjectIsolation,
  ): Promise<TaskResultDto> {
    this.emitEvent({
      type: 'progress',
      runId,
      message: 'Executing hybrid mode task...',
      progress: 30,
      timestamp: new Date(),
    });

    // Analyze task to determine which mode to use for each step
    const codeResult = await this.executeCodeGeneration(runId, request, isolation);

    this.emitEvent({
      type: 'progress',
      runId,
      message: 'Code generation complete, preparing desktop actions...',
      progress: 70,
      timestamp: new Date(),
    });

    // If needed, follow up with desktop automation
    // For now, return code generation result
    return new TaskResultDto({
      answer: codeResult.answer,
      confidence: codeResult.confidence,
      stepsTaken: [...codeResult.stepsTaken, 'Hybrid execution complete'],
      sources: codeResult.sources,
      executionTimeMs: codeResult.executionTimeMs,
    });
  }

  /**
   * Select the appropriate managed agent for a task
   */
  private selectAgent(task: string): ManagedAgent | undefined {
    const taskLower = task.toLowerCase();

    // File operations
    if (
      taskLower.includes('file') ||
      taskLower.includes('read') ||
      taskLower.includes('write') ||
      taskLower.includes('list')
    ) {
      return this.managedAgents.get('file_system');
    }

    // Analysis tasks
    if (
      taskLower.includes('analyze') ||
      taskLower.includes('analysis') ||
      taskLower.includes('complexity') ||
      taskLower.includes('reason')
    ) {
      return this.managedAgents.get('alpha');
    }

    // Tool management
    if (
      taskLower.includes('tool') ||
      taskLower.includes('discover') ||
      taskLower.includes('execute')
    ) {
      return this.managedAgents.get('tool_manager');
    }

    return undefined;
  }

  /**
   * Cancel a running workflow
   */
  async cancelWorkflow(runId: string): Promise<boolean> {
    const run = this.activeRuns.get(runId);
    if (!run || run.status !== BT1TaskStatus.RUNNING) {
      return false;
    }

    run.status = BT1TaskStatus.CANCELLED;

    this.emitEvent({
      type: 'cancelled',
      runId,
      message: 'Workflow cancelled by user',
      timestamp: new Date(),
    });

    this.multiIsolation.removeInstance(runId);
    return true;
  }

  /**
   * Get workflow status
   */
  getWorkflowStatus(runId: string): { status: BT1TaskStatus; task: string } | undefined {
    const run = this.activeRuns.get(runId);
    if (!run) return undefined;
    return { status: run.status, task: run.task };
  }

  /**
   * List active workflows
   */
  listActiveWorkflows(): { runId: string; task: string; status: BT1TaskStatus }[] {
    return [...this.activeRuns.entries()].map(([runId, run]) => ({
      runId,
      task: run.task,
      status: run.status,
    }));
  }

  /**
   * Emit workflow execution event
   */
  private emitEvent(event: WorkflowExecutionEvent): void {
    this.eventEmitter.emit('bt1zar.workflow', event);
    this.logger.debug(`Event emitted: ${event.type} for run ${event.runId}`);
  }

  /**
   * Get system status
   */
  async getSystemStatus(): Promise<{
    agents: { name: string; status: string }[];
    activeWorkflows: number;
    pythonBridgeHealthy: boolean;
    isolationHealth: Awaited<ReturnType<MultiProjectIsolation['getHealthStatus']>>;
  }> {
    const pythonBridgeHealthy = await this.pythonBridge.checkHealth();
    const isolationHealth = await this.multiIsolation.getHealthStatus();

    return {
      agents: [...this.managedAgents.values()].map((a) => ({
        name: a.getName(),
        status: a.getStatus().status,
      })),
      activeWorkflows: [...this.activeRuns.values()].filter(
        (r) => r.status === BT1TaskStatus.RUNNING,
      ).length,
      pythonBridgeHealthy,
      isolationHealth,
    };
  }
}
