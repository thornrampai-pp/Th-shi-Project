import { builder } from "../graphql/builder";
import { prisma } from "../config/prisma";

interface HealthStatusShape {
  status: string;
  dbConnected: boolean;
}

const HealthStatusType = builder
  .objectRef<HealthStatusShape>("HealthStatus")
  .implement({
    fields: (t) => ({
      status: t.exposeString("status"),
      dbConnected: t.exposeBoolean("dbConnected"),
    }),
  });

builder.queryField("health", (t) =>
  t.field({
    type: HealthStatusType,
    resolve: async () => {
      let dbConnected = true;

      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch {
        dbConnected = false;
      }

      return {
        status: "ok",
        dbConnected,
      };
    },
  }),
);