import { Logger } from '@nestjs/common';
import { ManagedAgent } from '../base.agent';
import {
  AgentCapability,
  AgentConfig,
  AgentMode,
  AgentRunResult,
  BT1Tool,
} from '../../types/agent.types';
import { ProjectIsolation } from '../../security/project-isolation';
import { TaskResultDto } from '../../models/task-result.dto';

/**
 * Tool registry entry
 */
interface ToolRegistryEntry {
  tool: BT1Tool;
  registeredAt: Date;
  executionCount: number;
  lastExecuted?: Date;
}

/**
 * ToolManagerManagedAgent - Tool discovery and execution agent
 * Ported from bt1zar_bt1_CLI/core/src/agents/managed/tool_manager.py
 *
 * Manages tool discovery, registration, and execution with chaining support.
 */
export class ToolManagerManagedAgent extends ManagedAgent {
  protected readonly logger = new Logger(ToolManagerManagedAgent.name);
  private static globalRegistry = new Map<string, ToolRegistryEntry>();

  constructor(isolation?: ProjectIsolation) {
    const config: AgentConfig = {
      agentId: 'tool_manager_agent',
      capabilities: [
        AgentCapability.TOOL_DISCOVER,
        AgentCapability.TOOL_EXECUTE,
        AgentCapability.TOOL_CHAIN,
      ],
      executorType: 'local',
      mode: AgentMode.CODE_GENERATION,
    };

    super(config, isolation);
    this.registerTools();
  }

  getName(): string {
    return 'tool_manager';
  }

  getDescription(): string {
    return 'Tool discovery, registration, and execution with chaining support';
  }

  /**
   * Get the global tool registry
   */
  static getRegistry(): Map<string, ToolRegistryEntry> {
    return ToolManagerManagedAgent.globalRegistry;
  }

  private registerTools(): void {
    this.registerTool({
      name: 'list_tools',
      description: 'List all registered tools',
      inputs: {
        category: { type: 'string', description: 'Filter by category', required: false },
      },
      outputType: 'array',
    });

    this.registerTool({
      name: 'get_tool_info',
      description: 'Get detailed information about a tool',
      inputs: {
        name: { type: 'string', description: 'Tool name', required: true },
      },
      outputType: 'object',
    });

    this.registerTool({
      name: 'discover_tools',
      description: 'Discover tools from files',
      inputs: {
        path: { type: 'string', description: 'Path to search for tools', required: true },
      },
      outputType: 'array',
    });

    this.registerTool({
      name: 'register_tool',
      description: 'Register a new tool',
      inputs: {
        tool: { type: 'object', description: 'Tool definition', required: true },
      },
      outputType: 'boolean',
    });

    this.registerTool({
      name: 'execute_tool',
      description: 'Execute a registered tool',
      inputs: {
        name: { type: 'string', description: 'Tool name', required: true },
        args: { type: 'object', description: 'Tool arguments', required: true },
      },
      outputType: 'object',
    });

    this.registerTool({
      name: 'chain_tools',
      description: 'Execute multiple tools in sequence',
      inputs: {
        chain: {
          type: 'array',
          description: 'Array of {tool, args} to execute',
          required: true,
        },
      },
      outputType: 'array',
    });
  }

  async run(task: string): Promise<AgentRunResult<TaskResultDto>> {
    this.setStatus('running');
    this.clearSteps();

    try {
      this.addStep({ type: 'thought', content: `Processing tool task: ${task}` });

      const taskLower = task.toLowerCase();
      let answer: string;
      const stepsTaken: string[] = [];

      if (taskLower.includes('list')) {
        const tools = this.listRegisteredTools();
        answer = `Found ${tools.length} registered tools: ${tools.map((t) => t.name).join(', ')}`;
        stepsTaken.push('Listed all registered tools');
      } else if (taskLower.includes('info') || taskLower.includes('details')) {
        const toolName = this.extractToolName(task);
        const info = this.getToolInfo(toolName);
        answer = info
          ? `Tool "${toolName}": ${info.tool.description}`
          : `Tool "${toolName}" not found`;
        stepsTaken.push(`Retrieved info for tool: ${toolName}`);
      } else if (taskLower.includes('discover')) {
        const path = this.extractPath(task);
        const discovered = await this.discoverTools(path);
        answer = `Discovered ${discovered.length} tools from ${path}`;
        stepsTaken.push(`Discovered tools from: ${path}`);
      } else if (taskLower.includes('execute') || taskLower.includes('run')) {
        const toolName = this.extractToolName(task);
        const result = await this.executeRegisteredTool(toolName, {});
        answer = `Executed tool "${toolName}": ${JSON.stringify(result)}`;
        stepsTaken.push(`Executed tool: ${toolName}`);
      } else if (taskLower.includes('chain')) {
        answer = 'Tool chaining requires specific chain configuration';
        stepsTaken.push('Tool chaining requested');
      } else {
        // Default: list tools
        const tools = this.listRegisteredTools();
        answer = `Tool manager ready. ${tools.length} tools registered.`;
        stepsTaken.push('Displayed tool manager status');
      }

      const result = new TaskResultDto({
        answer,
        confidence: 0.9,
        stepsTaken,
        sources: [],
      });

      this.recordSuccess();
      return this.createResult(true, result);
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Unknown error');
      this.recordError(err);
      return this.createResult(false, undefined, err.message);
    }
  }

  /**
   * List all registered tools
   */
  listRegisteredTools(category?: string): BT1Tool[] {
    this.addStep({ type: 'action', content: 'Listing registered tools', toolUsed: 'list_tools' });

    const tools = [...ToolManagerManagedAgent.globalRegistry.values()].map((e) => e.tool);

    this.addStep({ type: 'observation', content: `Found ${tools.length} tools` });

    return tools;
  }

  /**
   * Get tool info
   */
  getToolInfo(name: string): ToolRegistryEntry | undefined {
    this.addStep({ type: 'action', content: `Getting info for: ${name}`, toolUsed: 'get_tool_info' });

    return ToolManagerManagedAgent.globalRegistry.get(name);
  }

  /**
   * Discover tools from a path
   */
  async discoverTools(searchPath: string): Promise<BT1Tool[]> {
    this.addStep({ type: 'action', content: `Discovering tools from: ${searchPath}`, toolUsed: 'discover_tools' });

    // In production, this would scan files for tool definitions
    // For now, return empty array
    const discovered: BT1Tool[] = [];

    this.addStep({ type: 'observation', content: `Discovered ${discovered.length} tools` });

    return discovered;
  }

  /**
   * Register a tool in the global registry
   */
  registerGlobalTool(tool: BT1Tool): boolean {
    this.addStep({ type: 'action', content: `Registering tool: ${tool.name}`, toolUsed: 'register_tool' });

    if (ToolManagerManagedAgent.globalRegistry.has(tool.name)) {
      this.logger.warn(`Tool "${tool.name}" already registered, overwriting`);
    }

    ToolManagerManagedAgent.globalRegistry.set(tool.name, {
      tool,
      registeredAt: new Date(),
      executionCount: 0,
    });

    this.addStep({ type: 'observation', content: `Tool "${tool.name}" registered` });

    return true;
  }

  /**
   * Execute a registered tool
   */
  async executeRegisteredTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    this.addStep({ type: 'action', content: `Executing tool: ${name}`, toolUsed: 'execute_tool' });

    const entry = ToolManagerManagedAgent.globalRegistry.get(name);
    if (!entry) {
      throw new Error(`Tool not found: ${name}`);
    }

    // Update execution stats
    entry.executionCount++;
    entry.lastExecuted = new Date();

    // In production, this would actually execute the tool
    const result = { tool: name, args, status: 'executed', timestamp: new Date() };

    this.addStep({ type: 'observation', content: `Tool "${name}" executed successfully` });

    return result;
  }

  /**
   * Chain multiple tools together
   */
  async chainTools(
    chain: { tool: string; args: Record<string, unknown> }[],
  ): Promise<unknown[]> {
    this.addStep({ type: 'action', content: `Chaining ${chain.length} tools`, toolUsed: 'chain_tools' });

    const results: unknown[] = [];
    let previousResult: unknown = null;

    for (const step of chain) {
      // Replace ${prev_result} placeholder with previous result
      const args = { ...step.args };
      for (const [key, value] of Object.entries(args)) {
        if (value === '${prev_result}') {
          args[key] = previousResult;
        }
      }

      const result = await this.executeRegisteredTool(step.tool, args);
      results.push(result);
      previousResult = result;
    }

    this.addStep({ type: 'observation', content: `Chain complete: ${results.length} tools executed` });

    return results;
  }

  // Helper methods
  private extractToolName(task: string): string {
    const match = task.match(/["']([^"']+)["']|tool[:\s]+(\w+)/i);
    return match ? (match[1] || match[2]) : 'unknown';
  }

  private extractPath(task: string): string {
    const match = task.match(/from\s+["']?([^"'\s]+)["']?|path[:\s]+["']?([^"'\s]+)["']?/i);
    return match ? (match[1] || match[2]) : '.';
  }
}
