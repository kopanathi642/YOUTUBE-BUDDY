import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

import interfaceLabels from "./interface-labels.mjs";

export default defineConfig({
  plugins: [react({ babel: { plugins: [interfaceLabels] } })],
  server: { port: 5173, proxy: { "/api": "http://localhost:8000" } },
  test: { environment: "node" },
} as any);
