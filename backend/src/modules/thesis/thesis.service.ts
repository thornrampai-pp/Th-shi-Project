import { prisma } from "../../config/prisma";
import { AppError } from "../../common/errors/AppError";
import { assertPortfolioOwnership } from "../../common/utils/portfolio-ownership.util";

export type ThesisStatusValue = "DRAFT" | "WATCHING" | "ACTIVE" | "ARCHIVED";

export interface ThesisInput {
  assetId?: string;
  portfolioId?: string | null;
  status?: ThesisStatusValue;
  title?: string;
  summary?: string;
  entryPrice?: number;
  targetPrice?: number;
  stopLoss?: number;
  timeHorizon?: string;
  catalysts?: string;
  risks?: string;
  notes?: string;
}

const thesisInclude = { asset: true } as const;

async function getOwnedThesisOrThrow(userId: string, id: string) {
  const thesis = await prisma.investmentThesis.findUnique({ where: { id } });
  if (!thesis || thesis.userId !== userId) {
    throw AppError.notFound("Investment thesis not found");
  }
  return thesis;
}

async function validateRefs(userId: string, input: ThesisInput) {
  if (input.assetId) {
    const asset = await prisma.asset.findUnique({ where: { id: input.assetId } });
    if (!asset) throw AppError.notFound("Asset not found");
  }
  if (input.portfolioId) {
    await assertPortfolioOwnership(userId, input.portfolioId);
  }
  for (const [field, value] of [
    ["entryPrice", input.entryPrice],
    ["targetPrice", input.targetPrice],
    ["stopLoss", input.stopLoss],
  ] as const) {
    if (value != null && value <= 0) {
      throw AppError.badRequest(`${field} must be positive`);
    }
  }
}

export async function listTheses(
  userId: string,
  filters: { status?: ThesisStatusValue; assetId?: string; portfolioId?: string },
) {
  return prisma.investmentThesis.findMany({
    where: { userId, ...filters },
    include: thesisInclude,
    orderBy: { updatedAt: "desc" },
  });
}

export async function getThesis(userId: string, id: string) {
  await getOwnedThesisOrThrow(userId, id);
  return prisma.investmentThesis.findUniqueOrThrow({ where: { id }, include: thesisInclude });
}

export async function createThesis(
  userId: string,
  input: ThesisInput & { assetId: string; title: string },
) {
  if (!input.title.trim()) throw AppError.badRequest("title is required");
  await validateRefs(userId, input);

  return prisma.investmentThesis.create({
    data: { ...input, userId },
    include: thesisInclude,
  });
}

export async function updateThesis(userId: string, id: string, input: ThesisInput) {
  await getOwnedThesisOrThrow(userId, id);
  await validateRefs(userId, input);

  return prisma.investmentThesis.update({
    where: { id },
    data: input,
    include: thesisInclude,
  });
}

export async function deleteThesis(userId: string, id: string): Promise<boolean> {
  await getOwnedThesisOrThrow(userId, id);
  await prisma.investmentThesis.delete({ where: { id } });
  return true;
}
