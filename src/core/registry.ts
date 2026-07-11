import type { Tool } from './types';

// 全局工具注册表：UI 与功能解耦的核心
class ToolRegistry {
  private tools = new Map<string, Tool>();

  /** 注册一个工具（重复 id 会覆盖并告警） */
  register(tool: Tool): void {
    if (this.tools.has(tool.id)) {
      console.warn(`[registry] 工具 id 重复，已覆盖: ${tool.id}`);
    }
    this.tools.set(tool.id, tool);
  }

  get(id: string): Tool | undefined {
    return this.tools.get(id);
  }

  /** 返回全部已注册工具（供 UI 渲染列表） */
  list(): Tool[] {
    return [...this.tools.values()];
  }
}

export const registry = new ToolRegistry();
