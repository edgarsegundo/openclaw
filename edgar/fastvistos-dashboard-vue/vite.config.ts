import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import vueDevTools from "vite-plugin-vue-devtools";

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), vueDevTools(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5174,
    fs: {
      allow: [
        "../..", // permite servir node_modules da raiz do monorepo
        ".",
      ],
    },

    proxy: {
      "/api": {
        target: "http://localhost:3001", // Porta do seu backend Express
        changeOrigin: true,
      },
    },
  },
});
