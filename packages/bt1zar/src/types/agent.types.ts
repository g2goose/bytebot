/**
 * BT1ZAR Agent Types
 * Ported from bt1zar_bt1_CLI/core/src/agents/base.py
 */

/**
 * Agent capabilities enum - defines what an agent can do
 * Ported from Python AgentCapability enum
 */
export enum AgentCapability {
  // Coordination capabilities
  ROUTING = 'routing',
  COORDINATION = 'coordination',
  ORCHESTRATION = 'orchestration',

  // File operation capabilities
  FILE_READ = 'file_read',
  FILE_WRITE = 'file_write',
  FILE_VALIDATE = 'file_validate',
  FILE_LIST = 'file_list',

  // Analysis capabilities
  ANALYZE = 'analyze',
  TRANSFORM = 'transform',
  OPTIMIZE = 'optimize',
  REASON = 'reason',

  // Tool management capabilities
  TOOL_DISCOVER = 'tool_discover',
  TOOL_EXECUTE = 'tool_execute',
  TOOL_CHAIN = 'tool_chain',

  // Security capabilities
  SECURITY_VALIDATE = 'security_validate',
  SECURITY_AUDIT = 'security_audit',

  // Code capabilities
  CODE_GENERATE = 'code_generate',
  CODE_EXECUTE = 'code_execute',
}

/**
 * Executor types supported by the system
 */
export type ExecutorType =
  | 'local'
  | 'docker'
  | 'e2b'
  | 'modal'
  | 'blaxel'
  | 'python-bridge';

/**
 * Agent execution modes
 */
export enum AgentMode {
  DESKTOP_AUTOMATION = 'desktop_automation',
  CODE_GENERATION = 'code_generation',
  HYBRID = 'hybrid',
}

/**
 * Agent status information
 */
export interface AgentStatus {
  agentId: string;
  status: 'initialized' | 'running' | 'idle' | 'error' | 'stopped';
  lastActivity: Date | null;
  runCount: number;
  errorCount: number;
  capabilities: AgentCapability[];
  executorType: ExecutorType;
  mode: AgentMode;
}

/**
 * Agent configuration
 */
export interface AgentConfig {
  agentId: string;
  capabilities: AgentCapability[];
  executorType: ExecutorType;
  mode: AgentMode;
  projectRoot?: string;
  enableAudit?: boolean;
  maxSteps?: number;
  modelProvider?: string;
  modelName?: string;
}

/**
 * Individual execution step
 */
export interface AgentStep {
  type: 'thought' | 'action' | 'observation';
  content: string;
  timestamp: Date;
  toolUsed?: string;
  duration?: number;
}

/**
 * Token usage metrics
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * Agent execution result
 */
export interface AgentRunResult<T = unknown> {
  success: boolean;
  result?: T;
  error?: string;
  steps: AgentStep[];
  metrics: {
    duration: number;
    tokenUsage: TokenUsage;
  };
}

/**
 * Workflow execution event types
 */
export type WorkflowExecutionEventType =
  | 'start'
  | 'progress'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Workflow execution event payload
 */
export interface WorkflowExecutionEvent {
  type: WorkflowExecutionEventType;
  runId: string;
  taskId?: string;
  message?: string;
  progress?: number;
  result?: unknown;
  error?: string;
  timestamp: Date;
}

/**
 * Tool input schema definition
 */
export interface ToolInputSchema {
  [key: string]: {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    description: string;
    required?: boolean;
    enum?: string[];
    default?: unknown;
  };
}

/**
 * Base tool interface
 */
export interface BT1Tool {
  name: string;
  description: string;
  inputs: ToolInputSchema;
  outputType: string;
}

/**
 * Request to execute a bt1zar workflow
 */
export interface ExecuteWorkflowRequest {
  task: string;
  projectRoot?: string;
  modelId?: string;
  mode?: AgentMode;
  maxSteps?: number;
  timeout?: number;
}

/**
 * Response from workflow execution
 */
export interface ExecuteWorkflowResponse {
  success: boolean;
  runId: string;
  error?: string;
}

/**
 * bt1zar task status
 */
export enum BT1TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}
