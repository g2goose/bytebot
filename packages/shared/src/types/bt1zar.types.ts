/**
 * BT1ZAR Types for Bytebot Integration
 */

/**
 * Agent execution modes
 */
export enum AgentMode {
  DESKTOP_AUTOMATION = 'desktop_automation',
  CODE_GENERATION = 'code_generation',
  HYBRID = 'hybrid',
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
 * Execute workflow request
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
 * Execute workflow response
 */
export interface ExecuteWorkflowResponse {
  ok: boolean;
  runId?: string;
  error?: string;
}

/**
 * Cancel workflow request
 */
export interface CancelWorkflowRequest {
  runId: string;
}

/**
 * Get status response
 */
export interface BT1zarStatusResponse {
  ok: boolean;
  status?: {
    agents: { name: string; status: string }[];
    activeWorkflows: number;
    pythonBridgeHealthy: boolean;
  };
  error?: string;
}

/**
 * Type guard for workflow execution event
 */
export function isWorkflowExecutionEvent(obj: unknown): obj is WorkflowExecutionEvent {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'type' in obj &&
    'runId' in obj &&
    typeof (obj as WorkflowExecutionEvent).type === 'string' &&
    typeof (obj as WorkflowExecutionEvent).runId === 'string'
  );
}
