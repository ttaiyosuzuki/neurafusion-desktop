import { defineConfig } from "vitest/config";

/** ★NF 独自モジュールだけを対象にする。上流(monorepo)の巨大なテストは動かさない */
export default defineConfig({
  test: {
    include: ["__tests__/**/*.test.ts"],
    environment: "node",
  },
});
