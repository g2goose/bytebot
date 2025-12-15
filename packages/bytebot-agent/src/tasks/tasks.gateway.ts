import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  WorkflowExecutionEvent,
  ExecuteWorkflowRequest,
  ExecuteWorkflowResponse,
  CancelWorkflowRequest,
  BT1zarStatusResponse,
} from '@bytebot/shared';

// Forward reference to avoid circular dependency
interface OrchestratorServiceInterface {
  executeWorkflow(request: ExecuteWorkflowRequest): Promise<string>;
  cancelWorkflow(runId: string): Promise<boolean>;
  getSystemStatus(): Promise<{
    agents: { name: string; status: string }[];
    activeWorkflows: number;
    pythonBridgeHealthy: boolean;
  }>;
}

@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
})
export class TasksGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(TasksGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    @Optional() @Inject('ORCHESTRATOR_SERVICE')
    private readonly orchestrator?: OrchestratorServiceInterface,
  ) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join_task')
  handleJoinTask(client: Socket, taskId: string) {
    client.join(`task_${taskId}`);
    this.logger.log(`Client ${client.id} joined task ${taskId}`);
  }

  @SubscribeMessage('leave_task')
  handleLeaveTask(client: Socket, taskId: string) {
    client.leave(`task_${taskId}`);
    this.logger.log(`Client ${client.id} left task ${taskId}`);
  }

  // ===== BT1ZAR Workflow Events =====

  @SubscribeMessage('join_workflow')
  handleJoinWorkflow(client: Socket, runId: string) {
    client.join(`workflow_${runId}`);
    this.logger.log(`Client ${client.id} joined workflow ${runId}`);
  }

  @SubscribeMessage('leave_workflow')
  handleLeaveWorkflow(client: Socket, runId: string) {
    client.leave(`workflow_${runId}`);
    this.logger.log(`Client ${client.id} left workflow ${runId}`);
  }

  @SubscribeMessage('execute_workflow')
  async handleExecuteWorkflow(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ExecuteWorkflowRequest,
  ): Promise<ExecuteWorkflowResponse> {
    if (!this.orchestrator) {
      return { ok: false, error: 'BT1ZAR module not available' };
    }

    try {
      this.logger.log(`Workflow execution requested: ${payload.task.substring(0, 50)}...`);
      const runId = await this.orchestrator.executeWorkflow(payload);

      // Auto-join the client to the workflow room
      client.join(`workflow_${runId}`);

      return { ok: true, runId };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Workflow execution failed: ${message}`);
      return { ok: false, error: message };
    }
  }

  @SubscribeMessage('cancel_workflow')
  async handleCancelWorkflow(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: CancelWorkflowRequest,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!this.orchestrator) {
      return { ok: false, error: 'BT1ZAR module not available' };
    }

    try {
      const cancelled = await this.orchestrator.cancelWorkflow(payload.runId);
      return { ok: cancelled, error: cancelled ? undefined : 'Workflow not found or not running' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { ok: false, error: message };
    }
  }

  @SubscribeMessage('get_status')
  async handleGetStatus(): Promise<BT1zarStatusResponse> {
    if (!this.orchestrator) {
      return { ok: false, error: 'BT1ZAR module not available' };
    }

    try {
      const status = await this.orchestrator.getSystemStatus();
      return { ok: true, status };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { ok: false, error: message };
    }
  }

  // Listen for bt1zar workflow events and broadcast to clients
  @OnEvent('bt1zar.workflow')
  handleWorkflowEvent(event: WorkflowExecutionEvent) {
    this.logger.debug(`Workflow event: ${event.type} for ${event.runId}`);
    this.server.to(`workflow_${event.runId}`).emit('workflow_execution', event);
  }

  // ===== Existing Task Events =====

  emitTaskUpdate(taskId: string, task: unknown) {
    this.server.to(`task_${taskId}`).emit('task_updated', task);
  }

  emitNewMessage(taskId: string, message: unknown) {
    this.server.to(`task_${taskId}`).emit('new_message', message);
  }

  emitTaskCreated(task: unknown) {
    this.server.emit('task_created', task);
  }

  emitTaskDeleted(taskId: string) {
    this.server.emit('task_deleted', taskId);
  }

  // ===== BT1ZAR Workflow Emission Helpers =====

  emitWorkflowEvent(event: WorkflowExecutionEvent) {
    this.server.to(`workflow_${event.runId}`).emit('workflow_execution', event);
  }
}
