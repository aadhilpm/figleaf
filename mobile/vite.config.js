import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// The garment diagram is shared with the ERPNext form: ../figleaf/public/js/garment_diagram.js
const shared = fileURLToPath(new URL("../figleaf/public/js/garment_diagram.js", import.meta.url));

export default defineConfig({
  plugins: [react()],
  base: "./",
  resolve: { alias: { "@garment-diagram": shared } },
  server: { fs: { allow: [".."] } },
  build: { target: "es2020", outDir: "dist", emptyOutDir: true },
});
