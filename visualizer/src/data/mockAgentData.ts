/**
 * Mock data and types for AgentGuard Dashboard.
 * 
 * Based on PRISM model: Transaction Execution Flow
 * s4: Opportunity_Spotted (Start)
 * s3: TX_Construction (Processing)
 * s1: On_Chain_Revert (Failure/Retry)
 * s0: Network_Error (Error/Reset)
 * s2: TX_Confirmed (Goal)
 */

export type TransitionRecord = {
  from: string;
  action: string;
  to: string;
  probability?: number;
  labelStr?: string;
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
    value: 2.5000,
    threshold: 12.0,
    direction: "below",
    status: "[OK]"
  },
  {
    name: "max_prob_success",
    value: 0.7460, // Approx prob of s2 before s0 in stable loop
    threshold: 0.1,
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
  { from: "Opportunity_Spotted", action: "start", to: "TX_Construction", probability: 1.0, labelStr: "1.00" },
  { from: "TX_Construction", action: "submit_tx", to: "TX_Confirmed", probability: 0.50, labelStr: "0.50 (Success)" },
  { from: "TX_Construction", action: "submit_tx", to: "On_Chain_Revert", probability: 0.33, labelStr: "0.33 (Revert)" },
  { from: "TX_Construction", action: "submit_tx", to: "Network_Error", probability: 0.17, labelStr: "0.17 (Error)" },
  { from: "On_Chain_Revert", action: "retry", to: "TX_Construction", probability: 1.00, labelStr: "1.00 (Retry)" },
  { from: "Network_Error", action: "reset", to: "Opportunity_Spotted", probability: 1.00, labelStr: "1.00 (Reset)" },
  { from: "TX_Confirmed", action: "finalize", to: "Opportunity_Spotted", probability: 1.00, labelStr: "1.00 (Loop)" },
];

