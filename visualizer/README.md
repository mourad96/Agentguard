# AgentGuard Visualizer（React）

基于 **Vite + React + TypeScript** 的基础可视化：左侧 **状态转移图**（[@xyflow/react](https://reactflow.dev/)），右侧 **Gas 消耗** 与 **成功概率** 折线图（[Recharts](https://recharts.org/)）。数据目前来自 `src/data/mockAgentData.ts`，可替换为后端或 WebSocket 推送。

## 运行

```bash
cd visualizer
npm install
npm run dev
```

浏览器打开终端里提示的地址（一般为 `http://localhost:5173`）。

## 构建

```bash
npm run build
npm run preview
```

## 目录说明

| 路径 | 作用 |
|------|------|
| `src/App.tsx` | 左右分栏布局 |
| `src/components/TransitionGraph.tsx` | 状态转移有向图 |
| `src/components/MetricsCharts.tsx` | 两个折线图 |
| `src/data/mockAgentData.ts` | 演示用 transitions 与 metrics |
