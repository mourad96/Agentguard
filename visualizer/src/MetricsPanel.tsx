import {
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Area,
  AreaChart,
  ReferenceLine,
} from "recharts";

import type { MetricPoint } from "./data/mockAgentData";

type Props = {
  metrics: MetricPoint[];
};

const tooltipStyle = {
  backgroundColor: "rgba(20, 25, 35, 0.85)",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  borderRadius: 12,
  color: "#e8eaef",
  backdropFilter: "blur(12px)",
  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
};

export function MetricsPanel({ metrics }: Props) {
  return (
    <div className="metrics-charts">
      <section className="chart-card">
        <h2 className="chart-card__title">Max Cycles to Success Probability State</h2>
        <p className="chart-card__hint">
          Property: min_expected_cycles
        </p>
        <div className="chart-card__plot">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={metrics} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorCycles" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ec4899" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#ec4899" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="step" stroke="#8b9bb4" tick={{ fontSize: 12, fill: "#8b9bb4" }} axisLine={false} tickLine={false} />
              <YAxis stroke="#8b9bb4" tick={{ fontSize: 12, fill: "#8b9bb4" }} axisLine={false} tickLine={false} />
              <ReferenceLine y={50.0} stroke="#ef4444" strokeDasharray="3 3" />
              <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#ec4899" }} />
              <Area
                type="monotone"
                dataKey="min_expected_cycles"
                name="Cycles (min)"
                stroke="#ec4899"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorCycles)"
                activeDot={{ r: 6, fill: "#ec4899", stroke: "#0f1115", strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="chart-card">
        <h2 className="chart-card__title">Success Probability</h2>
        <p className="chart-card__hint">
          Property: max_prob_success
        </p>
        <div className="chart-card__plot">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={metrics} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorSuccess" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="step" stroke="#8b9bb4" tick={{ fontSize: 12, fill: "#8b9bb4" }} axisLine={false} tickLine={false} />
              <YAxis
                domain={[0, 1]}
                tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                stroke="#8b9bb4"
                tick={{ fontSize: 12, fill: "#8b9bb4" }}
                axisLine={false}
                tickLine={false}
              />
              <ReferenceLine y={0.8} stroke="#ef4444" strokeDasharray="3 3" />
              <Tooltip
                contentStyle={tooltipStyle}
                itemStyle={{ color: "#10b981" }}
                formatter={(value: number) => [`${(value * 100).toFixed(1)}%`, "Success Prob (max)"]}
              />
              <Area
                type="monotone"
                dataKey="max_prob_success"
                name="Success Probability"
                stroke="#10b981"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorSuccess)"
                activeDot={{ r: 6, fill: "#10b981", stroke: "#0f1115", strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
