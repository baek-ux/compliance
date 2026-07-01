import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Tailwind v4: 설정은 vite 플러그인 + CSS의 @import "tailwindcss" 로 처리.
// tailwind.config.js / postcss.config.js 불필요.
export default defineConfig({
  plugins: [react(), tailwindcss()],
});
