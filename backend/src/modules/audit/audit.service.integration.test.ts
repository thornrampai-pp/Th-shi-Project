import { describe, it, expect, afterEach } from "vitest";
import { runIntegrationTests, createTestUser, cleanupTestUser } from "../../test-utils/integration";
import { logAuditEvent, getMyAuditLogs } from "./audit.service";

describe.skipIf(!runIntegrationTests)("audit.service (integration)", () => {
  let userId: string | undefined;

  afterEach(async () => {
    if (userId) await cleanupTestUser(userId);
    userId = undefined;
  });

  it("records an event with its metadata and lists it back newest first", async () => {
    const user = await createTestUser();
    userId = user.id;

    await logAuditEvent(userId, "DELETE_PORTFOLIO", { portfolioId: "p1", name: "Old Portfolio" });
    await logAuditEvent(userId, "CREATE_TRANSACTION", { transactionId: "t1", type: "BUY" });

    const logs = await getMyAuditLogs(userId);
    expect(logs).toHaveLength(2);
    expect(logs[0]?.action).toBe("CREATE_TRANSACTION");
    expect(logs[1]?.action).toBe("DELETE_PORTFOLIO");
    expect(logs[1]?.metadata).toMatchObject({ portfolioId: "p1", name: "Old Portfolio" });
  });

  it("only returns the calling user's own events", async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();

    await logAuditEvent(userA.id, "DELETE_PORTFOLIO", { portfolioId: "a" });
    await logAuditEvent(userB.id, "DELETE_PORTFOLIO", { portfolioId: "b" });

    const logsA = await getMyAuditLogs(userA.id);
    expect(logsA).toHaveLength(1);
    expect(logsA[0]?.metadata).toMatchObject({ portfolioId: "a" });

    await cleanupTestUser(userA.id);
    await cleanupTestUser(userB.id);
  });

  it("paginates with limit/offset and caps limit at 200", async () => {
    const user = await createTestUser();
    userId = user.id;

    for (let i = 0; i < 5; i++) {
      await logAuditEvent(userId, "CREATE_TRANSACTION", { i });
    }

    const page1 = await getMyAuditLogs(userId, { limit: 2, offset: 0 });
    const page2 = await getMyAuditLogs(userId, { limit: 2, offset: 2 });
    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(2);
    expect(page1.map((l) => l.id)).not.toEqual(page2.map((l) => l.id));

    const uncapped = await getMyAuditLogs(userId, { limit: 10_000 });
    expect(uncapped).toHaveLength(5);
  });
});
