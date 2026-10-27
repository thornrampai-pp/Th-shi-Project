import express from 'express';
import cors from 'cors';
import { ApolloServer } from '@apollo/server';
import { unwrapResolverError } from '@apollo/server/errors';
import { expressMiddleware } from '@as-integrations/express5';
import { schema } from './modules';
import { buildContext, GraphQLContext } from './common/middlewares/auth.middleware';
import { AppError } from './common/errors/AppError';
import { createDiscordInteractionsRouter } from './modules/discord-bot/discord-interactions.route';
import { createJobsRouter } from './jobs/jobs.route';

export async function createApp() {
  const app = express();

  const apollo = new ApolloServer<GraphQLContext>({
    schema,
    // Surface AppError codes (NOT_FOUND, FORBIDDEN, ...) as extensions.code so clients
    // can branch on them instead of parsing messages.
    formatError: (formattedError, error) => {
      const original = unwrapResolverError(error);
      if (original instanceof AppError) {
        return {
          ...formattedError,
          message: original.message,
          extensions: { ...formattedError.extensions, code: original.code, httpStatus: original.httpStatus },
        };
      }
      return formattedError;
    },
  });
  await apollo.start();

  // Must be mounted before any JSON body parser — it needs the raw body for signature checks.
  app.use('/discord', createDiscordInteractionsRouter());
  app.use('/jobs', createJobsRouter());

  app.use(
    '/graphql',
    cors(),
    // Slip images arrive as base64 inside GraphQL variables, so the default 100kb is too small.
    express.json({ limit: '10mb' }),
    expressMiddleware(apollo, { context: buildContext }),
  );

  return app;
}
