import { prisma } from "../../config/prisma";

export type AuditAction = "CREATE_TRANSACTION" | "DELETE_PORTFOLIO" | "FORCE_REBALANCE";

/**
 * Best-effort audit trail. Callers fire this without awaiting (same convention as
 * notifyEvent/refreshHistoryAfterTransaction) — a logging failure must never roll back
 * or block the financial action it's recording.
 */
export async function logAuditEvent(
  userId: string,
  action: AuditAction,
  metadata?: unknown,
): Promise<void> {
  await prisma.auditLog.create({ data: { userId, action, metadata: metadata ?? undefined } });
}

export async function getMyAuditLogs(
  userId: string,
  pagination: { limit?: number; offset?: number } = {},
) {
  return prisma.auditLog.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: Math.min(pagination.limit ?? 50, 200),
    skip: pagination.offset ?? 0,
  });
}
