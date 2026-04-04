import { ReactFlowProvider } from "@xyflow/react";

import { MetricsCharts } from "./components/MetricsCharts";
import { TransitionGraph } from "./components/TransitionGraph";
import { mockMetrics, mockTransitions } from "./data/mockAgentData";
import "./App.css";

/**
 * 页面结构：
 * - 左侧：状态转移图（由 transitions 生成）
 * - 右侧：Gas + 成功概率 两个折线图
 *
 * 后续把 mockTransitions / mockMetrics 换成接口数据即可对接 AgentGuard 运行时。
 */
export default function App() {
  return (
    <div className="app">
      <header className="app__header">
        <div>
          <h1 className="app__title">AgentGuard 可视化</h1>
          <p className="app__subtitle">
            左侧为 MDP 状态转移示意，右侧为 Gas 与成功概率趋势（当前为演示数据）。
          </p>
        </div>
      </header>

      <main className="app__main">
        <section className="panel panel--graph" aria-label="状态转移图">
          <div className="panel__head">
            <h2 className="panel__title">状态转移图</h2>
            <span className="panel__badge">React Flow</span>
          </div>
          <ReactFlowProvider>
            <TransitionGraph transitions={mockTransitions} />
          </ReactFlowProvider>
        </section>

        <section className="panel panel--charts" aria-label="指标图表">
          <div className="panel__head">
            <h2 className="panel__title">运行指标</h2>
            <span className="panel__badge">Recharts</span>
          </div>
          <MetricsCharts metrics={mockMetrics} />
        </section>
      </main>
    </div>
  );
}
