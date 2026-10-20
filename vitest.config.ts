import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["supabase/tests/**/*.test.ts", "src/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
