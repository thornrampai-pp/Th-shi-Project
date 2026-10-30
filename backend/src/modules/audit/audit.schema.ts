import { builder } from "../../graphql/builder";
import { GraphQLContext, requireAuth } from "../../common/middlewares/auth.middleware";
import * as auditService from "./audit.service";

interface AuditLogShape {
  id: string;
  action: string;
  metadata: unknown;
  createdAt: Date;
}

const AuditLogType = builder.objectRef<AuditLogShape>("AuditLog").implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    action: t.exposeString("action"),
    metadataJson: t.field({
      type: "String",
      nullable: true,
      resolve: (log) => (log.metadata == null ? null : JSON.stringify(log.metadata)),
    }),
    createdAt: t.field({ type: "String", resolve: (log) => log.createdAt.toISOString() }),
  }),
});

builder.queryField("myAuditLogs", (t) =>
  t.field({
    type: [AuditLogType],
    description: "The current user's own audit trail (account/transaction/portfolio events), newest first",
    args: {
      limit: t.arg.int(),
      offset: t.arg.int(),
    },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return auditService.getMyAuditLogs(userId, {
        limit: args.limit ?? undefined,
        offset: args.offset ?? undefined,
      });
    },
  }),
);
