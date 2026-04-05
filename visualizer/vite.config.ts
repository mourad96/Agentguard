import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";

const rvDir = path.resolve(__dirname, "..", "Runtime_verification");

export default defineConfig({
  plugins: [
    react(),
    {
      name: "serve-runtime-verification-data",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = req.url?.split("?")[0];
          const fileMap: Record<string, string> = {
            "/latest_model.prism": path.join(rvDir, "latest_model.prism"),
            "/dashboard_report.txt": path.join(rvDir, "dashboard_report.txt"),
          };
          const filePath = fileMap[url ?? ""];
          if (filePath && fs.existsSync(filePath)) {
            res.setHeader("Content-Type", "text/plain");
            fs.createReadStream(filePath).pipe(res);
            return;
          }
          next();
        });
      },
    },
  ],
});
