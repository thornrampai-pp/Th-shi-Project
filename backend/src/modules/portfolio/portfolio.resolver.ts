import { GraphQLContext, requireAuth } from '../../common/middlewares/auth.middleware';
import * as portfolioService from './portfolio.service';
import type { PortfolioTypeValue, StrategyTypeValue } from './portfolio.service';

export const portfolioResolvers = {
  Portfolio: {
    initialPaperBalance: (parent: { initialPaperBalance: unknown }) =>
      parent.initialPaperBalance == null ? null : Number(parent.initialPaperBalance),
    paperCommissionRate: (parent: { paperCommissionRate: unknown }) =>
      parent.paperCommissionRate == null ? null : Number(parent.paperCommissionRate),
  },
  CashAccount: {
    balance: (parent: { balance: unknown }) => Number(parent.balance),
  },

  Query: {
    portfolio: (_: unknown, args: { id: string }, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return portfolioService.getPortfolioById(userId, args.id);
    },
    myPortfolios: (_: unknown, args: { type?: PortfolioTypeValue }, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return portfolioService.listMyPortfolios(userId, args.type);
    },
    cashAccounts: (_: unknown, args: { portfolioId: string }, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return portfolioService.listCashAccounts(userId, args.portfolioId);
    },
    tags: (_: unknown, __: unknown, context: GraphQLContext) => {
      requireAuth(context);
      return portfolioService.listTags();
    },
  },

  Mutation: {
    createPortfolio: (
      _: unknown,
      args: {
        name: string;
        strategy: StrategyTypeValue;
        baseCurrency: string;
        type: PortfolioTypeValue;
        isMargin?: boolean;
        initialPaperBalance?: number;
      },
      context: GraphQLContext,
    ) => {
      const userId = requireAuth(context);
      return portfolioService.createPortfolio(userId, args);
    },
    updatePortfolio: (
      _: unknown,
      args: { id: string; name?: string; description?: string; imageUrl?: string; strategy?: StrategyTypeValue },
      context: GraphQLContext,
    ) => {
      const userId = requireAuth(context);
      const { id, ...data } = args;
      return portfolioService.updatePortfolio(userId, id, data);
    },
    deletePortfolio: (_: unknown, args: { id: string }, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return portfolioService.deletePortfolio(userId, args.id);
    },
    addCashAccount: (
      _: unknown,
      args: { portfolioId: string; currency: string; isDomestic?: boolean },
      context: GraphQLContext,
    ) => {
      const userId = requireAuth(context);
      return portfolioService.addCashAccount(userId, args.portfolioId, args.currency, args.isDomestic);
    },
    createTag: (_: unknown, args: { name: string; color?: string }, context: GraphQLContext) => {
      requireAuth(context);
      return portfolioService.createTag(args.name, args.color);
    },
    tagPortfolio: (
      _: unknown,
      args: { portfolioId: string; tagId: string },
      context: GraphQLContext,
    ) => {
      const userId = requireAuth(context);
      return portfolioService.tagPortfolio(userId, args.portfolioId, args.tagId);
    },
  },
};
