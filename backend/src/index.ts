import { config } from './lib/config';
import express from "express";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express5"; // 🌟 ใช้ตัวนี้ตามที่คุณเลือก
import cors from "cors";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { schema } from "./graphql/schema";
import { GraphQLContext } from "./graphql/context";

async function startServer() {
  const app = express();

  app.use(cookieParser());

  const server = new ApolloServer<GraphQLContext>({
    schema,
  });

  await server.start();

  app.use(
    "/graphql",
    cors<cors.CorsRequest>({
      origin: ["http://localhost:3000"],
      credentials: true,
    }),
    bodyParser.json(),
    expressMiddleware<GraphQLContext>(server, {
      context: async ({ req, res }) => {
        const authorization = req.headers["authorization"] || "";
        let userId: string | null = null;

        try {
          if (authorization.startsWith("Bearer ")) {
            const token = authorization.split(" ")[1];

            const payload = jwt.verify(
              token!,
              config.jwt.accessSecret,
            ) as unknown as { userId: string };
            userId = payload.userId;
          }
        } catch (err) {
          // ปล่อยผ่านเพื่อให้ Request ที่ยังไม่ยืนยันตัวสามารถยิงคิวรี่บางตัวได้
        }

        return { req, res, userId };
      },
    }),
  );

  app.listen(config.port, () => {
    console.log(
      `🚀 Tōshi Backend Engine ready at http://localhost:4000/graphql`,
    );
  });
}

startServer();
