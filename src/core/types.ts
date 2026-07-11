// 核心：统一的工具接口（可扩展架构的基石）
// 所有 PDF 功能都实现该接口并注册到 registry，
// UI 只依赖 registry 与统一的 ToolInput/ToolResult，新增功能无需改动核心代码。

/** 工具可选参数（UI 据此自动渲染表单） */
export type ToolFieldType = 'select' | 'number' | 'text' | 'checkbox';

export interface ToolField {
  key: string;
  label: string;
  type: ToolFieldType;
  options?: { label: string; value: string | number }[];
  default?: string | number | boolean;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}

/** 进度回调：ratio ∈ [0,1]，label 为阶段说明 */
export interface ToolRunContext {
  onProgress?: (ratio: number, label?: string) => void;
  signal?: AbortSignal;
}

/** 统一输入：文件列表 + 表单参数 */
export interface ToolInput {
  files: File[];
  options: Record<string, string | number | boolean>;
}

/** 单个输出文件 */
export interface ToolResultFile {
  blob: Blob;
  name: string;
}

/** 统一输出：一个或多个文件 */
export type ToolOutput = ToolResultFile[];

export interface Tool {
  /** 唯一标识 */
  id: string;
  /** 展示名称 */
  title: string;
  /** 一句话说明 */
  description: string;
  /** 接受的文件类型（MIME 或扩展名），如 ['application/pdf'] */
  accept: string[];
  /** 是否接受多文件（默认单文件） */
  multiple?: boolean;
  /** 是否可在 Web Worker 中执行（纯计算、无 DOM 依赖，如 pdf-lib 类工具） */
  workerSafe?: boolean;
  /** 可选参数表单声明（UI 自动渲染） */
  fields?: ToolField[];
  /** 处理逻辑：纯前端，返回结果文件列表 */
  run(input: ToolInput, ctx?: ToolRunContext): Promise<ToolOutput>;
}
