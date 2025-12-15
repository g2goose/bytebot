/**
 * @bytebot/bt1zar - BT1ZAR code generation and analysis module for Bytebot
 *
 * This module provides code generation, analysis, and orchestration capabilities
 * ported from bt1zar_bt1_CLI to the bytebot TypeScript ecosystem.
 *
 * Features:
 * - Multi-agent orchestration (FileSystem, Alpha, ToolManager)
 * - Code analysis and complexity assessment
 * - Secure file operations with project isolation
 * - Python security bridge for validated execution
 * - Workflow execution in multiple modes (code_generation, desktop_automation, hybrid)
 */

// Module
export { BT1zarModule } from './bt1zar.module';

// Types
export * from './types';

// Models (DTOs)
export * from './models';

// Agents
export {
  BT1Agent,
  ManagedAgent,
} from './agents/base.agent';

export { OrchestratorService } from './agents/orchestrator.service';

export {
  FileSystemManagedAgent,
  AlphaManagedAgent,
  ToolManagerManagedAgent,
} from './agents/managed';

// Security
export {
  ProjectIsolation,
  MultiProjectIsolation,
} from './security/project-isolation';

export { PythonSecurityBridge } from './security/python-bridge.service';
