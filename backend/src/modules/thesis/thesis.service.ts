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
}

// Theses backfilled by migration 20261026164441_thesis_sections got Thai titles;
// users can rename those.
export const DEFAULT_SECTION_TITLES = [
  "Business & Revenue",
  "Growth Drivers",
  "Risks",
  "Competitors",
  "Entry & Exit Points",
  "Dividends",
];

// Saves to a section within this window update the latest history entry instead
// of adding one, so autosave doesn't flood the history.
const VERSION_MERGE_WINDOW_MS = 10 * 60 * 1000;

const thesisInclude = {
  asset: true,
  sections: { orderBy: { position: "asc" } },
} as const;

async function getOwnedThesisOrThrow(userId: string, id: string) {
  const thesis = await prisma.investmentThesis.findUnique({ where: { id } });
  if (!thesis || thesis.userId !== userId) {
    throw AppError.notFound("Investment thesis not found");
  }
  return thesis;
}

async function getOwnedSectionOrThrow(userId: string, id: string) {
  const section = await prisma.thesisSection.findUnique({ where: { id }, include: { thesis: true } });
  if (!section || section.thesis.userId !== userId) {
    throw AppError.notFound("Thesis section not found");
  }
  return section;
}

function requireTitle(title: string) {
  const trimmed = title.trim();
  if (!trimmed) throw AppError.badRequest("title is required");
  return trimmed;
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
  const title = requireTitle(input.title);
  await validateRefs(userId, input);

  return prisma.investmentThesis.create({
    data: {
      ...input,
      title,
      userId,
      sections: { create: DEFAULT_SECTION_TITLES.map((t, position) => ({ title: t, position })) },
    },
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

export async function addSection(userId: string, thesisId: string, title: string, content = "") {
  await getOwnedThesisOrThrow(userId, thesisId);
  const trimmed = requireTitle(title);

  return prisma.$transaction(async (tx) => {
    const last = await tx.thesisSection.findFirst({
      where: { thesisId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const section = await tx.thesisSection.create({
      data: { thesisId, title: trimmed, content, position: (last?.position ?? -1) + 1 },
    });
    if (content) await tx.thesisSectionVersion.create({ data: { sectionId: section.id, content } });
    await tx.investmentThesis.update({ where: { id: thesisId }, data: { updatedAt: new Date() } });
    return section;
  });
}

export async function updateSection(
  userId: string,
  id: string,
  input: { title?: string; content?: string },
) {
  const section = await getOwnedSectionOrThrow(userId, id);
  const title = input.title != null ? requireTitle(input.title) : undefined;
  const contentChanged = input.content != null && input.content !== section.content;

  return prisma.$transaction(async (tx) => {
    if (contentChanged) {
      const now = new Date();
      const latest = await tx.thesisSectionVersion.findFirst({
        where: { sectionId: id },
        orderBy: { createdAt: "desc" },
      });
      if (latest && now.getTime() - latest.createdAt.getTime() < VERSION_MERGE_WINDOW_MS) {
        await tx.thesisSectionVersion.update({
          where: { id: latest.id },
          data: { content: input.content, savedAt: now },
        });
      } else {
        await tx.thesisSectionVersion.create({ data: { sectionId: id, content: input.content!, savedAt: now } });
      }
    }
    if (title !== undefined || contentChanged) {
      await tx.investmentThesis.update({ where: { id: section.thesisId }, data: { updatedAt: new Date() } });
    }
    return tx.thesisSection.update({
      where: { id },
      data: { title, content: contentChanged ? input.content : undefined },
    });
  });
}

export async function deleteSection(userId: string, id: string): Promise<boolean> {
  await getOwnedSectionOrThrow(userId, id);
  await prisma.thesisSection.delete({ where: { id } });
  return true;
}

/** Newest first. */
export async function listSectionVersions(sectionId: string) {
  return prisma.thesisSectionVersion.findMany({
    where: { sectionId },
    orderBy: { createdAt: "desc" },
  });
}
