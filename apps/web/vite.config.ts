import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { secretBuildSafetyPlugin } from "./scripts/build-output-security.mjs";

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare(), secretBuildSafetyPlugin()],
});
