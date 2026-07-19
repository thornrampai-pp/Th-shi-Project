import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { config } from "./config";

const pool = new Pool({ connectionString: config.databaseUrl });
const adapter = new PrismaPg(pool);

// Pass the adapter directly to the constructor
export const prisma = new PrismaClient({ adapter });
