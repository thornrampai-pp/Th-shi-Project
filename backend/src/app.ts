import express from 'express';
import cors from 'cors';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express5';
import { typeDefs, resolvers } from './modules';
import { buildContext } from './common/middlewares/auth.middleware';

export async function createApp() {
  const app = express();

  const apollo = new ApolloServer({ typeDefs, resolvers });
  await apollo.start();

  app.use(
    '/graphql',
    cors(),
    express.json(),
    expressMiddleware(apollo, { context: buildContext }),
  );

  return app;
}
