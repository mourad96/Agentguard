/**
 * 演示数据：之后可换成从后端 / WebSocket / 父组件 props 传入的真实数据。
 *
 * transitions — 与 AgentGuard 的 log_transition(from, action, to) 一致
 * metrics — 每一步的「Gas」与模型检验得到的成功概率（此处为示例数值）
 */

export type TransitionRecord = {
  from: string;
  action: string;
  to: string;
};

export type MetricPoint = {
  /** 横轴：第几次检查 / 第几步 */
  step: number;
  /** Gas：可对应 API token、算力消耗等 */
  gas: number;
  /** 成功概率：0~1，对应 PCTL 等验证结果的展示 */
  successProbability: number;
};

/** 示例：研究型智能体的状态轨迹（与 Runtime_verification/demo 类似） */
export const mockTransitions: TransitionRecord[] = [
  { from: "idle", action: "search", to: "searching" },
  { from: "searching", action: "summarize", to: "summarizing" },
  { from: "summarizing", action: "report", to: "writing" },
  { from: "writing", action: "finish", to: "done" },
  { from: "searching", action: "fail", to: "error" },
];

/**
 * 示例时间序列：随 step 上升的累计 Gas 与波动中的成功概率。
 * 接入真实数据时，把每次验证周期 push 进来即可。
 */
export const mockMetrics: MetricPoint[] = [
  { step: 1, gas: 120, successProbability: 0.58 },
  { step: 2, gas: 280, successProbability: 0.62 },
  { step: 3, gas: 410, successProbability: 0.71 },
  { step: 4, gas: 590, successProbability: 0.68 },
  { step: 5, gas: 720, successProbability: 0.79 },
  { step: 6, gas: 880, successProbability: 0.84 },
];
