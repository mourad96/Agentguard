/**
 * Mock data and types for AgentGuard Dashboard.
 */

export type TransitionRecord = {
  from: string;
  action: string;
  to: string;
  probability?: number;
  labelStr?: string;
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
    threshold: 0.2,
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
  { from: "Opportunity_Spotted", action: "start", to: "TX_Construction", probability: 1.0, labelStr: "100% Success" },
  { from: "TX_Construction", action: "confirm", to: "TX_Confirmed", probability: 0.2, labelStr: "20% Success" },
  { from: "TX_Construction", action: "network_err", to: "Network_Error", probability: 0.3, labelStr: "30% NetworkErr" },
  { from: "TX_Construction", action: "revert", to: "On_Chain_Revert", probability: 0.5, labelStr: "50% Revert" },
  { from: "On_Chain_Revert", action: "retry", to: "TX_Construction", probability: 1.0, labelStr: "Retry" },
  { from: "Network_Error", action: "reset", to: "Opportunity_Spotted", probability: 1.0, labelStr: "Reset" },
];

export const initialMetrics: MetricPoint[] = [
  { step: 1, min_expected_cycles: 2.0, max_prob_success: 1.0, prob_missing_critical_action: 0.0 },
];
