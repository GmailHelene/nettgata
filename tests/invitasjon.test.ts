import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { demoInfo } from "@/db/demo";
import { createPgliteDb } from "@/db/pglite";
import { invitations, memberships, users } from "@/db/schema";
import { acceptInvitation, createInvitation, findInvitation, listAccess, removeMember } from "@/lib/invitations";
import { createSiteFromPack } from "@/lib/sites";

let db: Db;
let ownerId: string;
let siteId: string;

beforeEach(async () => {
  db = await createPgliteDb();
  const [owner] = await db.insert(users).values({ email: "helene@test.no", passwordHash: "x", isPlatformAdmin: true }).returning();
  ownerId = owner.id;
  siteId = (await createSiteFromPack(db, { name: "Salongen", packKey: "frisor", info: demoInfo, ownerId })).id;
});

describe("invitasjoner", () => {
  it("lager en lenke som bare lagres som hash, og som gir ny bruker tilgang én gang", async () => {
    const { token } = await createInvitation(db, { siteId, email: " Kari@Salongen.no ", role: "owner", invitedBy: ownerId });
    const [row] = await db.select().from(invitations);
    expect(row.email).toBe("kari@salongen.no");
    expect(row.tokenHash).not.toContain(token);
    expect((await findInvitation(db, token))?.siteName).toBe("Salongen");

    await expect(acceptInvitation(db, token, { name: "Kari", password: "et-langt-passord" })).rejects.toThrow(/godta vilkårene/);
    const { userId } = await acceptInvitation(db, token, { name: "Kari", password: "et-langt-passord" }, new Date(), true);
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    expect(user.email).toBe("kari@salongen.no");
    expect(await bcrypt.compare("et-langt-passord", user.passwordHash)).toBe(true);
    expect((await listAccess(db, siteId)).members.map((m) => m.email)).toContain("kari@salongen.no");

    await expect(acceptInvitation(db, token, { name: "Kari", password: "et-langt-passord" }, new Date(), true)).rejects.toThrow(/virker ikke lenger/);
  });

  it("avviser utløpte lenker, korte passord og folk som allerede har tilgang", async () => {
    const { token } = await createInvitation(db, { siteId, email: "ola@test.no", role: "editor", invitedBy: ownerId }, new Date("2026-01-01"));
    expect(await findInvitation(db, token, new Date("2026-01-09"))).toBeNull();

    const fresh = await createInvitation(db, { siteId, email: "per@test.no", role: "editor", invitedBy: ownerId });
    await expect(acceptInvitation(db, fresh.token, { name: "Per", password: "kort" })).rejects.toThrow(/12 tegn/);
    await expect(createInvitation(db, { siteId, email: "helene@test.no", role: "editor", invitedBy: ownerId })).rejects.toThrow(/allerede tilgang/);
    await expect(createInvitation(db, { siteId, email: "ikke-epost", role: "editor", invitedBy: ownerId })).rejects.toThrow(/e-postadressen/);
  });

  it("krever at innlogget bruker er den som ble invitert", async () => {
    const [other] = await db.insert(users).values({ email: "annen@test.no", passwordHash: "x" }).returning();
    const { token } = await createInvitation(db, { siteId, email: "mona@test.no", role: "editor", invitedBy: ownerId });
    await expect(acceptInvitation(db, token, { userId: other.id })).rejects.toThrow(/mona@test.no/);
  });

  it("lar ikke siste eier fjerne seg selv", async () => {
    await expect(removeMember(db, siteId, ownerId, ownerId)).rejects.toThrow(/minst én eier/);
    const { token } = await createInvitation(db, { siteId, email: "nils@test.no", role: "editor", invitedBy: ownerId });
    const { userId } = await acceptInvitation(db, token, { name: "Nils", password: "et-langt-passord" });
    await removeMember(db, siteId, userId, ownerId);
    expect(await db.select().from(memberships).where(eq(memberships.userId, userId))).toHaveLength(0);
  });
});
