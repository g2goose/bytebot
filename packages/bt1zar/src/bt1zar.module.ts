import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { OrchestratorService } from './agents/orchestrator.service';
import { PythonSecurityBridge } from './security/python-bridge.service';
import { ProjectIsolation } from './security/project-isolation';
import { FileSystemManagedAgent } from './agents/managed/file-system.agent';
import { AlphaManagedAgent } from './agents/managed/alpha.agent';
import { ToolManagerManagedAgent } from './agents/managed/tool-manager.agent';

/**
 * BT1zarModule - NestJS module for bt1zar functionality
 *
 * Provides code generation, analysis, and orchestration capabilities
 * within the bytebot ecosystem.
 *
 * Features:
 * - Orchestration service for workflow execution
 * - Python security bridge for validated code execution
 * - Managed agents (FileSystem, Alpha, ToolManager)
 * - Project isolation for security
 */
@Module({
  imports: [
    ConfigModule,
    HttpModule,
    EventEmitterModule.forRoot(),
  ],
  providers: [
    PythonSecurityBridge,
    OrchestratorService,
    {
      provide: 'DEFAULT_PROJECT_ISOLATION',
      useFactory: (configService: ConfigService) => {
        const projectRoot = configService.get<string>('BT1ZAR_PROJECT_ROOT') || process.cwd();
        const enableAudit = configService.get<boolean>('BT1ZAR_ENABLE_AUDIT') ?? true;
        return new ProjectIsolation(projectRoot, enableAudit);
      },
      inject: [ConfigService],
    },
    {
      provide: FileSystemManagedAgent,
      useFactory: (isolation: ProjectIsolation) => {
        return new FileSystemManagedAgent(isolation);
      },
      inject: ['DEFAULT_PROJECT_ISOLATION'],
    },
    {
      provide: AlphaManagedAgent,
      useFactory: (isolation: ProjectIsolation) => {
        return new AlphaManagedAgent(isolation);
      },
      inject: ['DEFAULT_PROJECT_ISOLATION'],
    },
    {
      provide: ToolManagerManagedAgent,
      useFactory: (isolation: ProjectIsolation) => {
        return new ToolManagerManagedAgent(isolation);
      },
      inject: ['DEFAULT_PROJECT_ISOLATION'],
    },
    // Provider alias for tasks gateway integration
    {
      provide: 'ORCHESTRATOR_SERVICE',
      useExisting: OrchestratorService,
    },
  ],
  exports: [
    OrchestratorService,
    'ORCHESTRATOR_SERVICE',
    PythonSecurityBridge,
    'DEFAULT_PROJECT_ISOLATION',
    FileSystemManagedAgent,
    AlphaManagedAgent,
    ToolManagerManagedAgent,
  ],
})
export class BT1zarModule implements OnModuleInit {
  private readonly logger = new Logger(BT1zarModule.name);

  constructor(
    private readonly orchestrator: OrchestratorService,
    private readonly fileSystemAgent: FileSystemManagedAgent,
    private readonly alphaAgent: AlphaManagedAgent,
    private readonly toolManagerAgent: ToolManagerManagedAgent,
  ) {}

  onModuleInit() {
    // Register managed agents with orchestrator
    this.orchestrator.registerAgent(this.fileSystemAgent);
    this.orchestrator.registerAgent(this.alphaAgent);
    this.orchestrator.registerAgent(this.toolManagerAgent);

    this.logger.log('BT1zarModule initialized with managed agents');
  }
}
