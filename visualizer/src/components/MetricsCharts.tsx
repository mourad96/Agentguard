import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { MetricPoint } from "../data/mockAgentData";

type Props = {
  metrics: MetricPoint[];
};

const tooltipStyle = {
  backgroundColor: "#1a1f28",
  border: "1px solid #2f3644",
  borderRadius: 8,
  color: "#e8eaef",
};

export function MetricsCharts({ metrics }: Props) {
  return (
    <div className="metrics-charts">
      <section className="chart-card">
        <h2 className="chart-card__title">Gas 消耗（累计）</h2>
        <p className="chart-card__hint">
          示例字段：可对接 API 调用次数、Token、或自定义「成本」指标。
        </p>
        <div className="chart-card__plot">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={metrics} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a3140" />
              <XAxis dataKey="step" stroke="#8b9bb4" tick={{ fontSize: 12 }} />
              <YAxis stroke="#8b9bb4" tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line
                type="monotone"
                dataKey="gas"
                name="Gas"
                stroke="#7dd3fc"
                strokeWidth={2}
                dot={{ r: 3, fill: "#7dd3fc" }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="chart-card">
        <h2 className="chart-card__title">成功概率</h2>
        <p className="chart-card__hint">
          示例字段：可对接模型检验输出（如 Pmax=? [F &quot;goal&quot;]）。
        </p>
        <div className="chart-card__plot">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={metrics} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a3140" />
              <XAxis dataKey="step" stroke="#8b9bb4" tick={{ fontSize: 12 }} />
              <YAxis
                domain={[0, 1]}
                tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                stroke="#8b9bb4"
                tick={{ fontSize: 12 }}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value: number) => [`${(value * 100).toFixed(1)}%`, "成功概率"]}
              />
              <Line
                type="monotone"
                dataKey="successProbability"
                name="成功概率"
                stroke="#86efac"
                strokeWidth={2}
                dot={{ r: 3, fill: "#86efac" }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
