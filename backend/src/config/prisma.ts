import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { env } from "../config/env";

const pool = new Pool({ connectionString: env.DATABASE_URL });
const adapter = new PrismaPg(pool);

// Pass the adapter directly to the constructor
export const prisma = new PrismaClient({ adapter });
