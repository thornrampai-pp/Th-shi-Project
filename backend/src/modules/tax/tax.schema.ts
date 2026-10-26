import { builder } from '../../graphql/builder';
import { GraphQLContext, requireAuth } from '../../common/middlewares/auth.middleware';
import { AssetType } from '../asset/asset.schema';
import { TransactionType } from '../transaction/transaction.schema';
import * as taxService from './tax.service';
import * as taxCalculator from './tax-calculator';
import { AppError } from '../../common/errors/AppError';
import type { TaxStatusValue, TaxTypeValue } from './tax.service';

export const TaxTypeEnum = builder.enumType('TaxType', {
  values: ['PERSONAL_INCOME', 'CAPITAL_GAIN', 'WITHHOLDING'] as const,
});

export const TaxStatusEnum = builder.enumType('TaxStatus', { values: ['PENDING', 'FILED', 'PAID'] as const });

type TaxRecordShape = Awaited<ReturnType<typeof taxService.listTaxRecords>>[number];

const TaxRecordType = builder.objectRef<TaxRecordShape>('TaxRecord').implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    transactionId: t.exposeString('transactionId'),
    portfolioId: t.exposeString('portfolioId'),
    sourceCountry: t.exposeString('sourceCountry'),
    taxType: t.field({ type: TaxTypeEnum, resolve: (r) => r.taxType }),
    incomeAmount: t.field({ type: 'Float', resolve: (r) => Number(r.incomeAmount) }),
    convertedAmountTHB: t.field({ type: 'Float', resolve: (r) => Number(r.convertedAmountTHB) }),
    fxRate: t.field({ type: 'Float', resolve: (r) => Number(r.fxRate) }),
    taxYear: t.exposeInt('taxYear'),
    earnedYear: t.exposeInt('earnedYear'),
    status: t.field({ type: TaxStatusEnum, resolve: (r) => r.status }),
    createdAt: t.field({ type: 'String', resolve: (r) => r.createdAt.toISOString() }),
    transaction: t.field({ type: TransactionType, resolve: (r) => r.transaction }),
  }),
});

interface TaxBreakdownShape {
  taxType: string;
  sourceCountry: string;
  incomeTHB: number;
  count: number;
}

const TaxBreakdownType = builder.objectRef<TaxBreakdownShape>('TaxBreakdown').implement({
  fields: (t) => ({
    taxType: t.field({ type: TaxTypeEnum, resolve: (b) => b.taxType as TaxTypeValue }),
    sourceCountry: t.exposeString('sourceCountry'),
    incomeTHB: t.exposeFloat('incomeTHB'),
    count: t.exposeInt('count'),
  }),
});

type TaxSummaryShape = Awaited<ReturnType<typeof taxService.getTaxSummary>>;

const TaxSummaryType = builder.objectRef<TaxSummaryShape>('TaxSummary').implement({
  fields: (t) => ({
    taxYear: t.exposeInt('taxYear'),
    currency: t.exposeString('currency'),
    totalIncomeTHB: t.exposeFloat('totalIncomeTHB'),
    foreignIncomeTHB: t.exposeFloat('foreignIncomeTHB'),
    withheldTaxTHB: t.exposeFloat('withheldTaxTHB'),
    repatriatedTHB: t.exposeFloat('repatriatedTHB'),
    pendingCount: t.exposeInt('pendingCount'),
    breakdown: t.field({ type: [TaxBreakdownType], resolve: (s) => s.breakdown }),
  }),
});

type TaxLotShape = Awaited<ReturnType<typeof taxService.listOpenTaxLots>>[number];

const TaxLotType = builder.objectRef<TaxLotShape>('TaxLot').implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    portfolioId: t.exposeString('portfolioId'),
    assetId: t.exposeString('assetId'),
    transactionId: t.exposeString('transactionId'),
    remainingQty: t.field({ type: 'Float', resolve: (l) => Number(l.remainingQty) }),
    purchasePrice: t.field({ type: 'Float', resolve: (l) => Number(l.purchasePrice) }),
    earnedYear: t.exposeInt('earnedYear'),
    executedAt: t.field({ type: 'String', resolve: (l) => l.executedAt.toISOString() }),
    asset: t.field({ type: AssetType, resolve: (l) => l.asset }),
  }),
});

builder.queryField('taxRecords', (t) =>
  t.field({
    type: [TaxRecordType],
    args: {
      taxYear: t.arg.int(),
      portfolioId: t.arg.id(),
      taxType: t.arg({ type: TaxTypeEnum }),
      status: t.arg({ type: TaxStatusEnum }),
    },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return taxService.listTaxRecords(userId, {
        taxYear: args.taxYear ?? undefined,
        portfolioId: args.portfolioId ? String(args.portfolioId) : undefined,
        taxType: (args.taxType as TaxTypeValue) ?? undefined,
        status: (args.status as TaxStatusValue) ?? undefined,
      });
    },
  }),
);

builder.queryField('taxSummary', (t) =>
  t.field({
    type: TaxSummaryType,
    args: { taxYear: t.arg.int({ required: true }), portfolioId: t.arg.id() },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return taxService.getTaxSummary(userId, args.taxYear, args.portfolioId ? String(args.portfolioId) : undefined);
    },
  }),
);

builder.queryField('openTaxLots', (t) =>
  t.field({
    type: [TaxLotType],
    args: { portfolioId: t.arg.id({ required: true }), assetId: t.arg.id() },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return taxService.listOpenTaxLots(
        userId,
        String(args.portfolioId),
        args.assetId ? String(args.assetId) : undefined,
      );
    },
  }),
);

builder.mutationField('updateTaxRecord', (t) =>
  t.field({
    type: TaxRecordType,
    args: {
      id: t.arg.id({ required: true }),
      status: t.arg({ type: TaxStatusEnum }),
      sourceCountry: t.arg.string(),
    },
    resolve: (_root, args, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return taxService.updateTaxRecord(userId, String(args.id), {
        status: (args.status as TaxStatusValue) ?? undefined,
        sourceCountry: args.sourceCountry ?? undefined,
      });
    },
  }),
);

/* ------------------------- Personal income tax calculator ------------------------- */

const TaxDeductionInput = builder.inputType('TaxDeductionInput', {
  fields: (t) => ({
    label: t.string({ required: true }),
    amount: t.float({ required: true }),
  }),
});

const PersonalIncomeTaxInputType = builder.inputType('PersonalIncomeTaxInput', {
  fields: (t) => ({
    taxYear: t.int({ required: true, description: 'CE year, e.g. 2026 (= ปีภาษี 2569)' }),
    totalIncome: t.float({ required: true, description: 'เงินได้พึงประเมินรวม (THB)' }),
    expenses: t.float({ description: 'ค่าใช้จ่ายที่หักได้ (THB)' }),
    deductions: t.field({ type: [TaxDeductionInput], description: 'ค่าลดหย่อน' }),
    taxCredits: t.float({ description: 'ภาษีที่ถูกหัก ณ ที่จ่าย / เครดิตภาษีต่างประเทศ (THB)' }),
  }),
});

type TaxCalcResult = ReturnType<typeof taxCalculator.calculatePersonalIncomeTax>;

const TaxBracketBreakdownType = builder
  .objectRef<TaxCalcResult['brackets'][number]>('TaxBracketBreakdown')
  .implement({
    fields: (t) => ({
      from: t.exposeFloat('from'),
      upTo: t.exposeFloat('upTo', { nullable: true }),
      rate: t.exposeFloat('rate'),
      taxableAmount: t.exposeFloat('taxableAmount'),
      tax: t.exposeFloat('tax'),
    }),
  });

const PersonalIncomeTaxResultType = builder.objectRef<TaxCalcResult>('PersonalIncomeTaxResult').implement({
  fields: (t) => ({
    taxYear: t.exposeInt('taxYear'),
    ruleSetId: t.exposeString('ruleSetId'),
    totalIncome: t.exposeFloat('totalIncome'),
    expenses: t.exposeFloat('expenses'),
    totalDeductions: t.exposeFloat('totalDeductions'),
    netIncome: t.exposeFloat('netIncome'),
    brackets: t.field({ type: [TaxBracketBreakdownType], resolve: (r) => r.brackets }),
    grossTax: t.exposeFloat('grossTax'),
    taxCredits: t.exposeFloat('taxCredits'),
    taxPayable: t.exposeFloat('taxPayable'),
    refund: t.exposeFloat('refund'),
    effectiveRate: t.exposeFloat('effectiveRate'),
    marginalRate: t.exposeFloat('marginalRate'),
    disclaimer: t.exposeString('disclaimer'),
  }),
});

builder.queryField('calculatePersonalIncomeTax', (t) =>
  t.field({
    type: PersonalIncomeTaxResultType,
    args: { input: t.arg({ type: PersonalIncomeTaxInputType, required: true }) },
    resolve: (_root, args, context: GraphQLContext) => {
      requireAuth(context);
      try {
        return taxCalculator.calculatePersonalIncomeTax({
          taxYear: args.input.taxYear,
          totalIncome: args.input.totalIncome,
          expenses: args.input.expenses ?? undefined,
          deductions: args.input.deductions ?? undefined,
          taxCredits: args.input.taxCredits ?? undefined,
        });
      } catch (err) {
        if (err instanceof taxCalculator.TaxCalculationError) throw AppError.badRequest(err.message);
        throw err;
      }
    },
  }),
);
