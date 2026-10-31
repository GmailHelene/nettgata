import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    env: {
      SESSION_SECRET: "test-hemmelighet-som-er-minst-32-tegn-lang",
      PLATFORM_HOSTS: "localhost:3000,app.helene.cloud",
      SITES_ROOT_DOMAIN: "helene.cloud",
    },
  },
});
