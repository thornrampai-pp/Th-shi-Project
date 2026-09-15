import { prisma } from '../config/prisma';

export const rootResolvers = {
  Query: {
    health: async () => {
      let dbConnected = true;
      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch {
        dbConnected = false;
      }
      return { status: 'ok', dbConnected };
    },
  },
};
