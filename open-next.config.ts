import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Ingen inkrementell cache ennå: alle sider rendres per forespørsel.
// Når kantcaching kommer, legges R2-cachen inn her (krever at R2 er slått på i kontoen).
export default defineCloudflareConfig({});
