import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "serve-repo-root-data",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = req.url?.split("?")[0];
          if (url === "/model.prism" || url === "/modeloutput.txt") {
            const rootFile = path.resolve(__dirname, "..", url.slice(1));
            if (fs.existsSync(rootFile)) {
              res.setHeader("Content-Type", "text/plain");
              fs.createReadStream(rootFile).pipe(res);
              return;
            }
          }
          next();
        });
      },
    },
  ],
});
