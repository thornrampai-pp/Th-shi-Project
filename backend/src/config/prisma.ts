import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import express from 'express';
import cors from 'cors';
import { PrismaClient } from '../generated/prisma'; // ตาม output path ใน config ของคุณ

const prisma = new PrismaClient();
const app = express();

async function startServer() {
  // บันทึกย่อ: ในขั้นตอนถัดไปเราจะเอา typeDefs และ resolvers จากแต่ละโมดูลมารวมกันที่นี่
  const server = new ApolloServer({
    typeDefs: `
      type Query {
        ping: String
      }
    `,
    resolvers: {
      Query: {
        ping: () => 'pong',
      },
    },
  });

  await server.start();

  app.use(cors());
  app.use(express.json());

  // ตั้งค่า Context เพื่อให้ทุก Resolver สามารถเรียกใช้ Prisma หรือตรวจ Token ได้
  app.use(
    '/graphql',
    expressMiddleware(server, {
      context: async ({ req }) => ({
        prisma,
        req,
        // user: สามารถเขียนฟังก์ชันแกะ JWT Token ตรงนี้ได้ในอนาคต
      }),
    })
  );

  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`🚀 Server ready at http://localhost:${PORT}/graphql`);
  });
}

startServer();