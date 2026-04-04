/**
 * Mock data and types for AgentGuard Dashboard.
 */

export type TransitionRecord = {
  from: string;
  action: string;
  to: string;
};

export type MetricPoint = {
  step: number;
  min_expected_cycles: number;
  max_prob_success: number;
  prob_missing_critical_action: number;
};

export type AGProperty = {
  name: string;
  value: number;
  threshold: number;
  direction: "below" | "above";
  status: "[OK]" | "[VIOLATED]";
};

export const INITIAL_PROPERTIES: AGProperty[] = [
  {
    name: "min_expected_cycles",
    value: 2.0000,
    threshold: 50.0,
    direction: "below",
    status: "[OK]"
  },
  {
    name: "max_prob_success",
    value: 1.0000,
    threshold: 0.8,
    direction: "above",
    status: "[OK]"
  },
  {
    name: "prob_missing_critical_action",
    value: 0.0000,
    threshold: 0.1,
    direction: "below",
    status: "[OK]"
  }
];

export const mockTransitions: TransitionRecord[] = [
  { from: "idle", action: "search", to: "searching" },
  { from: "searching", action: "summarize", to: "summarizing" },
  { from: "summarizing", action: "report", to: "writing" },
  { from: "writing", action: "finish", to: "done" },
  { from: "searching", action: "fail", to: "error" },
];

export const initialMetrics: MetricPoint[] = [
  { step: 1, min_expected_cycles: 2.0, max_prob_success: 1.0, prob_missing_critical_action: 0.0 },
];
