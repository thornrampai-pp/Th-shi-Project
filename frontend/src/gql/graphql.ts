/* eslint-disable */
/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
export type AlertCondition =
  | 'CHANGE_PCT_ABOVE'
  | 'CHANGE_PCT_BELOW'
  | 'DIVIDEND_YIELD_ABOVE'
  | 'PE_ABOVE'
  | 'PE_BELOW'
  | 'PRICE_ABOVE'
  | 'PRICE_BELOW';

export type AssetType =
  | 'CRYPTO'
  | 'ETF'
  | 'FOREX'
  | 'GOLD'
  | 'STOCK';

export type InvestmentThesisInput = {
  assetId?: string | number | null | undefined;
  entryPrice?: number | null | undefined;
  portfolioId?: string | number | null | undefined;
  status?: ThesisStatus | null | undefined;
  stopLoss?: number | null | undefined;
  summary?: string | null | undefined;
  targetPrice?: number | null | undefined;
  timeHorizon?: string | null | undefined;
  title?: string | null | undefined;
};

export type NotificationEventType =
  | 'ALERT_TRIGGERED'
  | 'BACKTEST_COMPLETED'
  | 'DAILY_SUMMARY'
  | 'ORDER_FILLED'
  | 'SYSTEM_ALERT'
  | 'TRANSACTION_EXECUTED';

export type PersonalIncomeTaxInput = {
  /** ค่าลดหย่อน */
  deductions?: Array<TaxDeductionInput> | null | undefined;
  /** ค่าใช้จ่ายที่หักได้ (THB) */
  expenses?: number | null | undefined;
  /** ภาษีที่ถูกหัก ณ ที่จ่าย / เครดิตภาษีต่างประเทศ (THB) */
  taxCredits?: number | null | undefined;
  /** CE year, e.g. 2026 (= ปีภาษี 2569) */
  taxYear: number;
  /** เงินได้พึงประเมินรวม (THB) */
  totalIncome: number;
};

export type PortfolioType =
  | 'PAPER'
  | 'REAL';

export type SlipImageInput = {
  imageBase64: string;
  mimeType?: string | null | undefined;
};

export type SlipMatchStatus =
  | 'AMBIGUOUS'
  | 'DUPLICATE'
  | 'ERROR'
  | 'EXTRACTION_FAILED'
  | 'INVALID'
  | 'MATCHED'
  | 'NOT_FOUND'
  | 'UNREADABLE';

export type StrategyType =
  | 'DIVIDEND'
  | 'GROWTH'
  | 'QUANT_ALGO'
  | 'TRADING'
  | 'VALUE';

export type TaxDeductionInput = {
  amount: number;
  label: string;
};

export type TaxStatus =
  | 'FILED'
  | 'PAID'
  | 'PENDING';

export type TaxType =
  | 'CAPITAL_GAIN'
  | 'PERSONAL_INCOME'
  | 'WITHHOLDING';

export type ThesisStatus =
  | 'ACTIVE'
  | 'ARCHIVED'
  | 'DRAFT'
  | 'WATCHING';

export type TransactionType =
  | 'ADJUSTMENT'
  | 'BUY'
  | 'DEPOSIT'
  | 'DIVIDEND'
  | 'FEE'
  | 'REPATRIATION'
  | 'SELL'
  | 'SPLIT'
  | 'TAX'
  | 'WITHDRAW';

export type UserRole =
  | 'ADMIN'
  | 'USER';

export type CreateAlertMutationVariables = Exact<{
  assetId: string | number;
  condition: AlertCondition;
  targetValue: number;
}>;


export type CreateAlertMutation = { createAlert: { id: string | null } | null };

export type UpdateAlertMutationVariables = Exact<{
  id: string | number;
  isActive?: boolean | null | undefined;
}>;


export type UpdateAlertMutation = { updateAlert: { id: string | null } | null };

export type DeleteAlertMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteAlertMutation = { deleteAlert: boolean | null };

export type LoginMutationVariables = Exact<{
  email: string;
  password: string;
}>;


export type LoginMutation = { login: { accessToken: string | null, refreshToken: string | null } | null };

export type RegisterMutationVariables = Exact<{
  email: string;
  password: string;
  firstName?: string | null | undefined;
  lastName?: string | null | undefined;
}>;


export type RegisterMutation = { register: { accessToken: string | null, refreshToken: string | null } | null };

export type LogoutMutationVariables = Exact<{
  refreshToken: string;
}>;


export type LogoutMutation = { logout: boolean | null };

export type CreatePortfolioMutationVariables = Exact<{
  name: string;
  strategy: StrategyType;
  baseCurrency: string;
  type: PortfolioType;
  initialPaperBalance?: number | null | undefined;
}>;


export type CreatePortfolioMutation = { createPortfolio: { id: string | null } | null };

export type AddAssetToPortfolioMutationVariables = Exact<{
  portfolioId: string | number;
  assetId: string | number;
  quantity: number;
  price: number;
  fee?: number | null | undefined;
  executedAt?: string | null | undefined;
  fundWithDeposit?: boolean | null | undefined;
}>;


export type AddAssetToPortfolioMutation = { createTransaction: { id: string | null } | null };

export type PortfolioCashAccountsQueryVariables = Exact<{
  portfolioId: string | number;
}>;


export type PortfolioCashAccountsQuery = { cashAccounts: Array<{ currency: string | null }> | null };

export type AddCashAccountMutationVariables = Exact<{
  portfolioId: string | number;
  currency: string;
  isDomestic?: boolean | null | undefined;
}>;


export type AddCashAccountMutation = { addCashAccount: { id: string | null } | null };

export type RecordTransactionMutationVariables = Exact<{
  portfolioId: string | number;
  type: TransactionType;
  assetId?: string | number | null | undefined;
  quantity?: number | null | undefined;
  price?: number | null | undefined;
  amount?: number | null | undefined;
  currency?: string | null | undefined;
  fee?: number | null | undefined;
  taxWithheld?: number | null | undefined;
  note?: string | null | undefined;
  executedAt?: string | null | undefined;
}>;


export type RecordTransactionMutation = { createTransaction: { id: string | null } | null };

export type UpdateProfileMutationVariables = Exact<{
  firstName?: string | null | undefined;
  lastName?: string | null | undefined;
  taxResidency?: string | null | undefined;
}>;


export type UpdateProfileMutation = { updateProfile: { id: string | null } | null };

export type ChangePasswordMutationVariables = Exact<{
  oldPassword: string;
  newPassword: string;
}>;


export type ChangePasswordMutation = { changePassword: boolean | null };

export type MeEmailQueryVariables = Exact<{ [key: string]: never; }>;


export type MeEmailQuery = { me: { email: string | null } | null };

export type ReLoginMutationVariables = Exact<{
  email: string;
  password: string;
}>;


export type ReLoginMutation = { login: { accessToken: string | null, refreshToken: string | null } | null };

export type GenerateDiscordLinkCodeMutationVariables = Exact<{ [key: string]: never; }>;


export type GenerateDiscordLinkCodeMutation = { generateDiscordLinkCode: string | null };

export type ConnectDiscordChannelMutationVariables = Exact<{
  webhookUrl: string;
  label?: string | null | undefined;
  events: Array<NotificationEventType> | NotificationEventType;
}>;


export type ConnectDiscordChannelMutation = { connectDiscordChannel: { id: string | null } | null };

export type UpdateNotificationChannelMutationVariables = Exact<{
  id: string | number;
  isActive?: boolean | null | undefined;
  events?: Array<NotificationEventType> | NotificationEventType | null | undefined;
}>;


export type UpdateNotificationChannelMutation = { updateNotificationChannel: { id: string | null } | null };

export type TestNotificationChannelMutationVariables = Exact<{
  id: string | number;
}>;


export type TestNotificationChannelMutation = { testNotificationChannel: boolean | null };

export type RemoveNotificationChannelMutationVariables = Exact<{
  id: string | number;
}>;


export type RemoveNotificationChannelMutation = { removeNotificationChannel: boolean | null };

export type UpdateTaxRecordStatusMutationVariables = Exact<{
  id: string | number;
  status?: TaxStatus | null | undefined;
}>;


export type UpdateTaxRecordStatusMutation = { updateTaxRecord: { id: string | null } | null };

export type CalculatePersonalIncomeTaxQueryVariables = Exact<{
  input: PersonalIncomeTaxInput;
}>;


export type CalculatePersonalIncomeTaxQuery = { calculatePersonalIncomeTax: { taxYear: number | null, totalIncome: number | null, expenses: number | null, totalDeductions: number | null, netIncome: number | null, grossTax: number | null, taxCredits: number | null, taxPayable: number | null, refund: number | null, effectiveRate: number | null, marginalRate: number | null, disclaimer: string | null, brackets: Array<{ from: number | null, upTo: number | null, rate: number | null, taxableAmount: number | null, tax: number | null }> | null } | null };

export type WatchListIdsQueryVariables = Exact<{ [key: string]: never; }>;


export type WatchListIdsQuery = { watchLists: Array<{ id: string | null }> | null };

export type CreateWatchListMutationVariables = Exact<{
  name: string;
}>;


export type CreateWatchListMutation = { createWatchList: { id: string | null } | null };

export type AddWatchListItemMutationVariables = Exact<{
  watchListId: string | number;
  assetId: string | number;
}>;


export type AddWatchListItemMutation = { addWatchListItem: { id: string | null } | null };

export type RemoveWatchListItemMutationVariables = Exact<{
  watchListId: string | number;
  assetId: string | number;
}>;


export type RemoveWatchListItemMutation = { removeWatchListItem: { id: string | null } | null };

export type SearchAssetsQueryVariables = Exact<{
  search: string;
}>;


export type SearchAssetsQuery = { assets: Array<{ id: string | null, symbol: string | null, name: string | null, type: AssetType | null, exchange: string | null }> | null };

export type LookupSymbolQueryVariables = Exact<{
  symbol: string;
}>;


export type LookupSymbolQuery = { searchAssetSymbol: { id: string | null, symbol: string | null, name: string | null, type: AssetType | null, exchange: string | null } | null };

export type CreateThesisMutationVariables = Exact<{
  assetId: string | number;
  title: string;
}>;


export type CreateThesisMutation = { createInvestmentThesis: { id: string | null } | null };

export type UpdateThesisMutationVariables = Exact<{
  id: string | number;
  input: InvestmentThesisInput;
}>;


export type UpdateThesisMutation = { updateInvestmentThesis: { id: string | null } | null };

export type AddThesisSectionMutationVariables = Exact<{
  thesisId: string | number;
  title: string;
}>;


export type AddThesisSectionMutation = { addThesisSection: { id: string | null } | null };

export type UpdateThesisSectionMutationVariables = Exact<{
  id: string | number;
  title?: string | null | undefined;
  content?: string | null | undefined;
}>;


export type UpdateThesisSectionMutation = { updateThesisSection: { id: string | null } | null };

export type DeleteThesisSectionMutationVariables = Exact<{
  id: string | number;
}>;


export type DeleteThesisSectionMutation = { deleteThesisSection: boolean | null };

export type AlertsQueryVariables = Exact<{ [key: string]: never; }>;


export type AlertsQuery = { alerts: Array<{ id: string | null, condition: AlertCondition | null, targetValue: number | null, isActive: boolean | null, updatedAt: string | null, asset: { id: string | null, symbol: string | null, name: string | null, type: AssetType | null, exchange: string | null } | null }> | null };

export type AppShellMeQueryVariables = Exact<{ [key: string]: never; }>;


export type AppShellMeQuery = { me: { email: string | null, firstName: string | null } | null };

export type AutoMatchSlipsMutationVariables = Exact<{
  images: Array<SlipImageInput> | SlipImageInput;
  portfolioId?: string | number | null | undefined;
}>;


export type AutoMatchSlipsMutation = { autoMatchSlips: Array<{ status: SlipMatchStatus | null, message: string | null, transactionId: string | null, isAmountMatched: boolean | null, amount: number | null, currency: string | null, transRef: string | null, assetSymbol: string | null, candidateIds: Array<string> | null }> | null };

export type PortfolioHoldingsFieldsFragment = { portfolioId: string | null, name: string | null, strategy: string | null, type: string | null, currency: string | null, cash: number | null, equity: number | null, marketValue: number | null, costBasis: number | null, unrealizedPL: number | null, unrealizedPLPct: number | null, realizedPL: number | null, holdings: Array<{ assetId: string | null, symbol: string | null, name: string | null, assetCurrency: string | null, quantity: number | null, avgPrice: number | null, marketPrice: number | null, marketValue: number | null, costBasis: number | null, unrealizedPL: number | null, unrealizedPLPct: number | null, weight: number | null }> | null };

export type PortfolioOverviewQueryVariables = Exact<{ [key: string]: never; }>;


export type PortfolioOverviewQuery = { portfolioOverview: { currency: string | null, marketValue: number | null, costBasis: number | null, unrealizedPL: number | null, unrealizedPLPct: number | null, realizedPL: number | null, portfolios: Array<{ portfolioId: string | null, name: string | null, strategy: string | null, type: string | null, currency: string | null, cash: number | null, equity: number | null, marketValue: number | null, costBasis: number | null, unrealizedPL: number | null, unrealizedPLPct: number | null, realizedPL: number | null, holdings: Array<{ assetId: string | null, symbol: string | null, name: string | null, assetCurrency: string | null, quantity: number | null, avgPrice: number | null, marketPrice: number | null, marketValue: number | null, costBasis: number | null, unrealizedPL: number | null, unrealizedPLPct: number | null, weight: number | null }> | null }> | null } | null };

export type PortfolioListQueryVariables = Exact<{ [key: string]: never; }>;


export type PortfolioListQuery = { myPortfolios: Array<{ id: string | null, name: string | null, type: PortfolioType | null, createdAt: string | null }> | null };

export type PortfolioHoldingsQueryVariables = Exact<{
  portfolioId: string | number;
}>;


export type PortfolioHoldingsQuery = { portfolioHoldings: { portfolioId: string | null, name: string | null, strategy: string | null, type: string | null, currency: string | null, cash: number | null, equity: number | null, marketValue: number | null, costBasis: number | null, unrealizedPL: number | null, unrealizedPLPct: number | null, realizedPL: number | null, holdings: Array<{ assetId: string | null, symbol: string | null, name: string | null, assetCurrency: string | null, quantity: number | null, avgPrice: number | null, marketPrice: number | null, marketValue: number | null, costBasis: number | null, unrealizedPL: number | null, unrealizedPLPct: number | null, weight: number | null }> | null } | null };

export type PortfolioTransactionsQueryVariables = Exact<{
  portfolioId: string | number;
}>;


export type PortfolioTransactionsQuery = { transactions: Array<{ id: string | null, type: TransactionType | null, executedAt: string | null, assetSymbol: string | null, mainAssetId: string | null, mainQuantity: number | null, mainPrice: number | null, baseCurrAmount: number | null, currency: string | null, fee: number | null, taxWithheld: number | null, realizedPL: number | null, note: string | null, hasSlip: boolean | null }> | null, cashAccounts: Array<{ id: string | null, currency: string | null, balance: number | null, isDomestic: boolean | null }> | null };

export type SettingsQueryVariables = Exact<{ [key: string]: never; }>;


export type SettingsQuery = { me: { email: string | null, firstName: string | null, lastName: string | null, taxResidency: string | null, role: UserRole | null, discordLinked: boolean | null } | null, notificationChannels: Array<{ id: string | null, label: string | null, isActive: boolean | null, events: Array<NotificationEventType> | null, webhookUrlPreview: string | null }> | null };

export type TaxPageQueryVariables = Exact<{
  taxYear: number;
  portfolioId?: string | number | null | undefined;
}>;


export type TaxPageQuery = { taxSummary: { totalIncomeTHB: number | null, foreignIncomeTHB: number | null, withheldTaxTHB: number | null, repatriatedTHB: number | null, pendingCount: number | null, breakdown: Array<{ taxType: TaxType | null, sourceCountry: string | null, incomeTHB: number | null, count: number | null }> | null } | null, taxRecords: Array<{ id: string | null, portfolioId: string | null, taxType: TaxType | null, sourceCountry: string | null, incomeAmount: number | null, convertedAmountTHB: number | null, fxRate: number | null, earnedYear: number | null, status: TaxStatus | null, transaction: { executedAt: string | null, assetSymbol: string | null, currency: string | null, taxWithheld: number | null } | null }> | null, myPortfolios: Array<{ id: string | null, name: string | null }> | null };

export type WatchlistStockQueryVariables = Exact<{
  assetId: string | number;
}>;


export type WatchlistStockQuery = { asset: { id: string | null, symbol: string | null, name: string | null, type: AssetType | null, exchange: string | null } | null, investmentTheses: Array<{ id: string | null, status: ThesisStatus | null, summary: string | null, sections: Array<{ id: string | null, title: string | null, content: string | null, history: Array<{ id: string | null, content: string | null, savedAt: string | null }> | null }> | null }> | null };

export type WatchlistOverviewQueryVariables = Exact<{ [key: string]: never; }>;


export type WatchlistOverviewQuery = { watchLists: Array<{ id: string | null, items: Array<{ id: string | null, createdAt: string | null, asset: { id: string | null, symbol: string | null, name: string | null, type: AssetType | null, exchange: string | null } | null }> | null }> | null, investmentTheses: Array<{ assetId: string | null, status: ThesisStatus | null, updatedAt: string | null }> | null };

export type RefreshTokenMutationVariables = Exact<{
  refreshToken: string;
}>;


export type RefreshTokenMutation = { refreshToken: { accessToken: string | null, refreshToken: string | null } | null };

export const PortfolioHoldingsFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PortfolioHoldingsFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"PortfolioHoldings"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"portfolioId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"strategy"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"currency"}},{"kind":"Field","name":{"kind":"Name","value":"cash"}},{"kind":"Field","name":{"kind":"Name","value":"equity"}},{"kind":"Field","name":{"kind":"Name","value":"marketValue"}},{"kind":"Field","name":{"kind":"Name","value":"costBasis"}},{"kind":"Field","name":{"kind":"Name","value":"unrealizedPL"}},{"kind":"Field","name":{"kind":"Name","value":"unrealizedPLPct"}},{"kind":"Field","name":{"kind":"Name","value":"realizedPL"}},{"kind":"Field","name":{"kind":"Name","value":"holdings"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"assetId"}},{"kind":"Field","name":{"kind":"Name","value":"symbol"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"assetCurrency"}},{"kind":"Field","name":{"kind":"Name","value":"quantity"}},{"kind":"Field","name":{"kind":"Name","value":"avgPrice"}},{"kind":"Field","name":{"kind":"Name","value":"marketPrice"}},{"kind":"Field","name":{"kind":"Name","value":"marketValue"}},{"kind":"Field","name":{"kind":"Name","value":"costBasis"}},{"kind":"Field","name":{"kind":"Name","value":"unrealizedPL"}},{"kind":"Field","name":{"kind":"Name","value":"unrealizedPLPct"}},{"kind":"Field","name":{"kind":"Name","value":"weight"}}]}}]}}]} as unknown as DocumentNode<PortfolioHoldingsFieldsFragment, unknown>;
export const CreateAlertDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateAlert"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"assetId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"condition"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"AlertCondition"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"targetValue"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Float"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createAlert"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"assetId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"assetId"}}},{"kind":"Argument","name":{"kind":"Name","value":"condition"},"value":{"kind":"Variable","name":{"kind":"Name","value":"condition"}}},{"kind":"Argument","name":{"kind":"Name","value":"targetValue"},"value":{"kind":"Variable","name":{"kind":"Name","value":"targetValue"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<CreateAlertMutation, CreateAlertMutationVariables>;
export const UpdateAlertDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateAlert"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"isActive"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Boolean"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateAlert"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}},{"kind":"Argument","name":{"kind":"Name","value":"isActive"},"value":{"kind":"Variable","name":{"kind":"Name","value":"isActive"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<UpdateAlertMutation, UpdateAlertMutationVariables>;
export const DeleteAlertDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DeleteAlert"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"deleteAlert"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}]}]}}]} as unknown as DocumentNode<DeleteAlertMutation, DeleteAlertMutationVariables>;
export const LoginDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"Login"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"email"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"password"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"login"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"email"},"value":{"kind":"Variable","name":{"kind":"Name","value":"email"}}},{"kind":"Argument","name":{"kind":"Name","value":"password"},"value":{"kind":"Variable","name":{"kind":"Name","value":"password"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"accessToken"}},{"kind":"Field","name":{"kind":"Name","value":"refreshToken"}}]}}]}}]} as unknown as DocumentNode<LoginMutation, LoginMutationVariables>;
export const RegisterDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"Register"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"email"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"password"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"firstName"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"lastName"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"register"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"email"},"value":{"kind":"Variable","name":{"kind":"Name","value":"email"}}},{"kind":"Argument","name":{"kind":"Name","value":"password"},"value":{"kind":"Variable","name":{"kind":"Name","value":"password"}}},{"kind":"Argument","name":{"kind":"Name","value":"firstName"},"value":{"kind":"Variable","name":{"kind":"Name","value":"firstName"}}},{"kind":"Argument","name":{"kind":"Name","value":"lastName"},"value":{"kind":"Variable","name":{"kind":"Name","value":"lastName"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"accessToken"}},{"kind":"Field","name":{"kind":"Name","value":"refreshToken"}}]}}]}}]} as unknown as DocumentNode<RegisterMutation, RegisterMutationVariables>;
export const LogoutDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"Logout"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"refreshToken"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"logout"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"refreshToken"},"value":{"kind":"Variable","name":{"kind":"Name","value":"refreshToken"}}}]}]}}]} as unknown as DocumentNode<LogoutMutation, LogoutMutationVariables>;
export const CreatePortfolioDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreatePortfolio"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"name"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"strategy"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"StrategyType"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"baseCurrency"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"type"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"PortfolioType"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"initialPaperBalance"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Float"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createPortfolio"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"name"},"value":{"kind":"Variable","name":{"kind":"Name","value":"name"}}},{"kind":"Argument","name":{"kind":"Name","value":"strategy"},"value":{"kind":"Variable","name":{"kind":"Name","value":"strategy"}}},{"kind":"Argument","name":{"kind":"Name","value":"baseCurrency"},"value":{"kind":"Variable","name":{"kind":"Name","value":"baseCurrency"}}},{"kind":"Argument","name":{"kind":"Name","value":"type"},"value":{"kind":"Variable","name":{"kind":"Name","value":"type"}}},{"kind":"Argument","name":{"kind":"Name","value":"initialPaperBalance"},"value":{"kind":"Variable","name":{"kind":"Name","value":"initialPaperBalance"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<CreatePortfolioMutation, CreatePortfolioMutationVariables>;
export const AddAssetToPortfolioDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"AddAssetToPortfolio"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"portfolioId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"assetId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"quantity"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Float"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"price"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Float"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"fee"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Float"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"executedAt"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"fundWithDeposit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Boolean"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createTransaction"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"portfolioId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"portfolioId"}}},{"kind":"Argument","name":{"kind":"Name","value":"type"},"value":{"kind":"EnumValue","value":"BUY"}},{"kind":"Argument","name":{"kind":"Name","value":"assetId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"assetId"}}},{"kind":"Argument","name":{"kind":"Name","value":"quantity"},"value":{"kind":"Variable","name":{"kind":"Name","value":"quantity"}}},{"kind":"Argument","name":{"kind":"Name","value":"price"},"value":{"kind":"Variable","name":{"kind":"Name","value":"price"}}},{"kind":"Argument","name":{"kind":"Name","value":"fee"},"value":{"kind":"Variable","name":{"kind":"Name","value":"fee"}}},{"kind":"Argument","name":{"kind":"Name","value":"executedAt"},"value":{"kind":"Variable","name":{"kind":"Name","value":"executedAt"}}},{"kind":"Argument","name":{"kind":"Name","value":"fundWithDeposit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"fundWithDeposit"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<AddAssetToPortfolioMutation, AddAssetToPortfolioMutationVariables>;
export const PortfolioCashAccountsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"PortfolioCashAccounts"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"portfolioId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"cashAccounts"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"portfolioId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"portfolioId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"currency"}}]}}]}}]} as unknown as DocumentNode<PortfolioCashAccountsQuery, PortfolioCashAccountsQueryVariables>;
export const AddCashAccountDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"AddCashAccount"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"portfolioId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"currency"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"isDomestic"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Boolean"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"addCashAccount"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"portfolioId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"portfolioId"}}},{"kind":"Argument","name":{"kind":"Name","value":"currency"},"value":{"kind":"Variable","name":{"kind":"Name","value":"currency"}}},{"kind":"Argument","name":{"kind":"Name","value":"isDomestic"},"value":{"kind":"Variable","name":{"kind":"Name","value":"isDomestic"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<AddCashAccountMutation, AddCashAccountMutationVariables>;
export const RecordTransactionDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"RecordTransaction"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"portfolioId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"type"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"TransactionType"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"assetId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"quantity"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Float"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"price"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Float"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"amount"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Float"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"currency"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"fee"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Float"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"taxWithheld"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Float"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"note"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"executedAt"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createTransaction"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"portfolioId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"portfolioId"}}},{"kind":"Argument","name":{"kind":"Name","value":"type"},"value":{"kind":"Variable","name":{"kind":"Name","value":"type"}}},{"kind":"Argument","name":{"kind":"Name","value":"assetId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"assetId"}}},{"kind":"Argument","name":{"kind":"Name","value":"quantity"},"value":{"kind":"Variable","name":{"kind":"Name","value":"quantity"}}},{"kind":"Argument","name":{"kind":"Name","value":"price"},"value":{"kind":"Variable","name":{"kind":"Name","value":"price"}}},{"kind":"Argument","name":{"kind":"Name","value":"amount"},"value":{"kind":"Variable","name":{"kind":"Name","value":"amount"}}},{"kind":"Argument","name":{"kind":"Name","value":"currency"},"value":{"kind":"Variable","name":{"kind":"Name","value":"currency"}}},{"kind":"Argument","name":{"kind":"Name","value":"fee"},"value":{"kind":"Variable","name":{"kind":"Name","value":"fee"}}},{"kind":"Argument","name":{"kind":"Name","value":"taxWithheld"},"value":{"kind":"Variable","name":{"kind":"Name","value":"taxWithheld"}}},{"kind":"Argument","name":{"kind":"Name","value":"note"},"value":{"kind":"Variable","name":{"kind":"Name","value":"note"}}},{"kind":"Argument","name":{"kind":"Name","value":"executedAt"},"value":{"kind":"Variable","name":{"kind":"Name","value":"executedAt"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<RecordTransactionMutation, RecordTransactionMutationVariables>;
export const UpdateProfileDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateProfile"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"firstName"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"lastName"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"taxResidency"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateProfile"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"firstName"},"value":{"kind":"Variable","name":{"kind":"Name","value":"firstName"}}},{"kind":"Argument","name":{"kind":"Name","value":"lastName"},"value":{"kind":"Variable","name":{"kind":"Name","value":"lastName"}}},{"kind":"Argument","name":{"kind":"Name","value":"taxResidency"},"value":{"kind":"Variable","name":{"kind":"Name","value":"taxResidency"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<UpdateProfileMutation, UpdateProfileMutationVariables>;
export const ChangePasswordDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ChangePassword"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"oldPassword"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"newPassword"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"changePassword"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"oldPassword"},"value":{"kind":"Variable","name":{"kind":"Name","value":"oldPassword"}}},{"kind":"Argument","name":{"kind":"Name","value":"newPassword"},"value":{"kind":"Variable","name":{"kind":"Name","value":"newPassword"}}}]}]}}]} as unknown as DocumentNode<ChangePasswordMutation, ChangePasswordMutationVariables>;
export const MeEmailDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"MeEmail"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"me"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"email"}}]}}]}}]} as unknown as DocumentNode<MeEmailQuery, MeEmailQueryVariables>;
export const ReLoginDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ReLogin"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"email"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"password"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"login"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"email"},"value":{"kind":"Variable","name":{"kind":"Name","value":"email"}}},{"kind":"Argument","name":{"kind":"Name","value":"password"},"value":{"kind":"Variable","name":{"kind":"Name","value":"password"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"accessToken"}},{"kind":"Field","name":{"kind":"Name","value":"refreshToken"}}]}}]}}]} as unknown as DocumentNode<ReLoginMutation, ReLoginMutationVariables>;
export const GenerateDiscordLinkCodeDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"GenerateDiscordLinkCode"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"generateDiscordLinkCode"}}]}}]} as unknown as DocumentNode<GenerateDiscordLinkCodeMutation, GenerateDiscordLinkCodeMutationVariables>;
export const ConnectDiscordChannelDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ConnectDiscordChannel"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"webhookUrl"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"label"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"events"}},"type":{"kind":"NonNullType","type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"NotificationEventType"}}}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"connectDiscordChannel"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"webhookUrl"},"value":{"kind":"Variable","name":{"kind":"Name","value":"webhookUrl"}}},{"kind":"Argument","name":{"kind":"Name","value":"label"},"value":{"kind":"Variable","name":{"kind":"Name","value":"label"}}},{"kind":"Argument","name":{"kind":"Name","value":"events"},"value":{"kind":"Variable","name":{"kind":"Name","value":"events"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<ConnectDiscordChannelMutation, ConnectDiscordChannelMutationVariables>;
export const UpdateNotificationChannelDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateNotificationChannel"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"isActive"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Boolean"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"events"}},"type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"NotificationEventType"}}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateNotificationChannel"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}},{"kind":"Argument","name":{"kind":"Name","value":"isActive"},"value":{"kind":"Variable","name":{"kind":"Name","value":"isActive"}}},{"kind":"Argument","name":{"kind":"Name","value":"events"},"value":{"kind":"Variable","name":{"kind":"Name","value":"events"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<UpdateNotificationChannelMutation, UpdateNotificationChannelMutationVariables>;
export const TestNotificationChannelDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"TestNotificationChannel"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"testNotificationChannel"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}]}]}}]} as unknown as DocumentNode<TestNotificationChannelMutation, TestNotificationChannelMutationVariables>;
export const RemoveNotificationChannelDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"RemoveNotificationChannel"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"removeNotificationChannel"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}]}]}}]} as unknown as DocumentNode<RemoveNotificationChannelMutation, RemoveNotificationChannelMutationVariables>;
export const UpdateTaxRecordStatusDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateTaxRecordStatus"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"status"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"TaxStatus"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateTaxRecord"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}},{"kind":"Argument","name":{"kind":"Name","value":"status"},"value":{"kind":"Variable","name":{"kind":"Name","value":"status"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<UpdateTaxRecordStatusMutation, UpdateTaxRecordStatusMutationVariables>;
export const CalculatePersonalIncomeTaxDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"CalculatePersonalIncomeTax"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"PersonalIncomeTaxInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"calculatePersonalIncomeTax"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"taxYear"}},{"kind":"Field","name":{"kind":"Name","value":"totalIncome"}},{"kind":"Field","name":{"kind":"Name","value":"expenses"}},{"kind":"Field","name":{"kind":"Name","value":"totalDeductions"}},{"kind":"Field","name":{"kind":"Name","value":"netIncome"}},{"kind":"Field","name":{"kind":"Name","value":"brackets"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"from"}},{"kind":"Field","name":{"kind":"Name","value":"upTo"}},{"kind":"Field","name":{"kind":"Name","value":"rate"}},{"kind":"Field","name":{"kind":"Name","value":"taxableAmount"}},{"kind":"Field","name":{"kind":"Name","value":"tax"}}]}},{"kind":"Field","name":{"kind":"Name","value":"grossTax"}},{"kind":"Field","name":{"kind":"Name","value":"taxCredits"}},{"kind":"Field","name":{"kind":"Name","value":"taxPayable"}},{"kind":"Field","name":{"kind":"Name","value":"refund"}},{"kind":"Field","name":{"kind":"Name","value":"effectiveRate"}},{"kind":"Field","name":{"kind":"Name","value":"marginalRate"}},{"kind":"Field","name":{"kind":"Name","value":"disclaimer"}}]}}]}}]} as unknown as DocumentNode<CalculatePersonalIncomeTaxQuery, CalculatePersonalIncomeTaxQueryVariables>;
export const WatchListIdsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"WatchListIds"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"watchLists"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<WatchListIdsQuery, WatchListIdsQueryVariables>;
export const CreateWatchListDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateWatchList"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"name"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createWatchList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"name"},"value":{"kind":"Variable","name":{"kind":"Name","value":"name"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<CreateWatchListMutation, CreateWatchListMutationVariables>;
export const AddWatchListItemDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"AddWatchListItem"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"watchListId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"assetId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"addWatchListItem"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"watchListId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"watchListId"}}},{"kind":"Argument","name":{"kind":"Name","value":"assetId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"assetId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<AddWatchListItemMutation, AddWatchListItemMutationVariables>;
export const RemoveWatchListItemDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"RemoveWatchListItem"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"watchListId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"assetId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"removeWatchListItem"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"watchListId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"watchListId"}}},{"kind":"Argument","name":{"kind":"Name","value":"assetId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"assetId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<RemoveWatchListItemMutation, RemoveWatchListItemMutationVariables>;
export const SearchAssetsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"SearchAssets"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"search"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"assets"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"search"},"value":{"kind":"Variable","name":{"kind":"Name","value":"search"}}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"8"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"symbol"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"exchange"}}]}}]}}]} as unknown as DocumentNode<SearchAssetsQuery, SearchAssetsQueryVariables>;
export const LookupSymbolDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"LookupSymbol"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"symbol"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"searchAssetSymbol"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"symbol"},"value":{"kind":"Variable","name":{"kind":"Name","value":"symbol"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"symbol"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"exchange"}}]}}]}}]} as unknown as DocumentNode<LookupSymbolQuery, LookupSymbolQueryVariables>;
export const CreateThesisDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateThesis"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"assetId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"title"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createInvestmentThesis"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"assetId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"assetId"}}},{"kind":"Argument","name":{"kind":"Name","value":"title"},"value":{"kind":"Variable","name":{"kind":"Name","value":"title"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<CreateThesisMutation, CreateThesisMutationVariables>;
export const UpdateThesisDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateThesis"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"InvestmentThesisInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateInvestmentThesis"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}},{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<UpdateThesisMutation, UpdateThesisMutationVariables>;
export const AddThesisSectionDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"AddThesisSection"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"thesisId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"title"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"addThesisSection"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"thesisId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"thesisId"}}},{"kind":"Argument","name":{"kind":"Name","value":"title"},"value":{"kind":"Variable","name":{"kind":"Name","value":"title"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<AddThesisSectionMutation, AddThesisSectionMutationVariables>;
export const UpdateThesisSectionDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateThesisSection"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"title"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"content"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateThesisSection"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}},{"kind":"Argument","name":{"kind":"Name","value":"title"},"value":{"kind":"Variable","name":{"kind":"Name","value":"title"}}},{"kind":"Argument","name":{"kind":"Name","value":"content"},"value":{"kind":"Variable","name":{"kind":"Name","value":"content"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<UpdateThesisSectionMutation, UpdateThesisSectionMutationVariables>;
export const DeleteThesisSectionDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DeleteThesisSection"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"deleteThesisSection"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}]}]}}]} as unknown as DocumentNode<DeleteThesisSectionMutation, DeleteThesisSectionMutationVariables>;
export const AlertsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Alerts"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"alerts"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"condition"}},{"kind":"Field","name":{"kind":"Name","value":"targetValue"}},{"kind":"Field","name":{"kind":"Name","value":"isActive"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"asset"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"symbol"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"exchange"}}]}}]}}]}}]} as unknown as DocumentNode<AlertsQuery, AlertsQueryVariables>;
export const AppShellMeDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"AppShellMe"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"me"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"firstName"}}]}}]}}]} as unknown as DocumentNode<AppShellMeQuery, AppShellMeQueryVariables>;
export const AutoMatchSlipsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"AutoMatchSlips"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"images"}},"type":{"kind":"NonNullType","type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"SlipImageInput"}}}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"portfolioId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"autoMatchSlips"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"images"},"value":{"kind":"Variable","name":{"kind":"Name","value":"images"}}},{"kind":"Argument","name":{"kind":"Name","value":"portfolioId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"portfolioId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"message"}},{"kind":"Field","name":{"kind":"Name","value":"transactionId"}},{"kind":"Field","name":{"kind":"Name","value":"isAmountMatched"}},{"kind":"Field","name":{"kind":"Name","value":"amount"}},{"kind":"Field","name":{"kind":"Name","value":"currency"}},{"kind":"Field","name":{"kind":"Name","value":"transRef"}},{"kind":"Field","name":{"kind":"Name","value":"assetSymbol"}},{"kind":"Field","name":{"kind":"Name","value":"candidateIds"}}]}}]}}]} as unknown as DocumentNode<AutoMatchSlipsMutation, AutoMatchSlipsMutationVariables>;
export const PortfolioOverviewDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"PortfolioOverview"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"portfolioOverview"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"currency"}},{"kind":"Field","name":{"kind":"Name","value":"marketValue"}},{"kind":"Field","name":{"kind":"Name","value":"costBasis"}},{"kind":"Field","name":{"kind":"Name","value":"unrealizedPL"}},{"kind":"Field","name":{"kind":"Name","value":"unrealizedPLPct"}},{"kind":"Field","name":{"kind":"Name","value":"realizedPL"}},{"kind":"Field","name":{"kind":"Name","value":"portfolios"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"PortfolioHoldingsFields"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PortfolioHoldingsFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"PortfolioHoldings"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"portfolioId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"strategy"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"currency"}},{"kind":"Field","name":{"kind":"Name","value":"cash"}},{"kind":"Field","name":{"kind":"Name","value":"equity"}},{"kind":"Field","name":{"kind":"Name","value":"marketValue"}},{"kind":"Field","name":{"kind":"Name","value":"costBasis"}},{"kind":"Field","name":{"kind":"Name","value":"unrealizedPL"}},{"kind":"Field","name":{"kind":"Name","value":"unrealizedPLPct"}},{"kind":"Field","name":{"kind":"Name","value":"realizedPL"}},{"kind":"Field","name":{"kind":"Name","value":"holdings"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"assetId"}},{"kind":"Field","name":{"kind":"Name","value":"symbol"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"assetCurrency"}},{"kind":"Field","name":{"kind":"Name","value":"quantity"}},{"kind":"Field","name":{"kind":"Name","value":"avgPrice"}},{"kind":"Field","name":{"kind":"Name","value":"marketPrice"}},{"kind":"Field","name":{"kind":"Name","value":"marketValue"}},{"kind":"Field","name":{"kind":"Name","value":"costBasis"}},{"kind":"Field","name":{"kind":"Name","value":"unrealizedPL"}},{"kind":"Field","name":{"kind":"Name","value":"unrealizedPLPct"}},{"kind":"Field","name":{"kind":"Name","value":"weight"}}]}}]}}]} as unknown as DocumentNode<PortfolioOverviewQuery, PortfolioOverviewQueryVariables>;
export const PortfolioListDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"PortfolioList"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"myPortfolios"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]} as unknown as DocumentNode<PortfolioListQuery, PortfolioListQueryVariables>;
export const PortfolioHoldingsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"PortfolioHoldings"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"portfolioId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"portfolioHoldings"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"portfolioId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"portfolioId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"PortfolioHoldingsFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PortfolioHoldingsFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"PortfolioHoldings"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"portfolioId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"strategy"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"currency"}},{"kind":"Field","name":{"kind":"Name","value":"cash"}},{"kind":"Field","name":{"kind":"Name","value":"equity"}},{"kind":"Field","name":{"kind":"Name","value":"marketValue"}},{"kind":"Field","name":{"kind":"Name","value":"costBasis"}},{"kind":"Field","name":{"kind":"Name","value":"unrealizedPL"}},{"kind":"Field","name":{"kind":"Name","value":"unrealizedPLPct"}},{"kind":"Field","name":{"kind":"Name","value":"realizedPL"}},{"kind":"Field","name":{"kind":"Name","value":"holdings"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"assetId"}},{"kind":"Field","name":{"kind":"Name","value":"symbol"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"assetCurrency"}},{"kind":"Field","name":{"kind":"Name","value":"quantity"}},{"kind":"Field","name":{"kind":"Name","value":"avgPrice"}},{"kind":"Field","name":{"kind":"Name","value":"marketPrice"}},{"kind":"Field","name":{"kind":"Name","value":"marketValue"}},{"kind":"Field","name":{"kind":"Name","value":"costBasis"}},{"kind":"Field","name":{"kind":"Name","value":"unrealizedPL"}},{"kind":"Field","name":{"kind":"Name","value":"unrealizedPLPct"}},{"kind":"Field","name":{"kind":"Name","value":"weight"}}]}}]}}]} as unknown as DocumentNode<PortfolioHoldingsQuery, PortfolioHoldingsQueryVariables>;
export const PortfolioTransactionsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"PortfolioTransactions"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"portfolioId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"transactions"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"portfolioId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"portfolioId"}}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"200"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"executedAt"}},{"kind":"Field","name":{"kind":"Name","value":"assetSymbol"}},{"kind":"Field","name":{"kind":"Name","value":"mainAssetId"}},{"kind":"Field","name":{"kind":"Name","value":"mainQuantity"}},{"kind":"Field","name":{"kind":"Name","value":"mainPrice"}},{"kind":"Field","name":{"kind":"Name","value":"baseCurrAmount"}},{"kind":"Field","name":{"kind":"Name","value":"currency"}},{"kind":"Field","name":{"kind":"Name","value":"fee"}},{"kind":"Field","name":{"kind":"Name","value":"taxWithheld"}},{"kind":"Field","name":{"kind":"Name","value":"realizedPL"}},{"kind":"Field","name":{"kind":"Name","value":"note"}},{"kind":"Field","name":{"kind":"Name","value":"hasSlip"}}]}},{"kind":"Field","name":{"kind":"Name","value":"cashAccounts"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"portfolioId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"portfolioId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"currency"}},{"kind":"Field","name":{"kind":"Name","value":"balance"}},{"kind":"Field","name":{"kind":"Name","value":"isDomestic"}}]}}]}}]} as unknown as DocumentNode<PortfolioTransactionsQuery, PortfolioTransactionsQueryVariables>;
export const SettingsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Settings"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"me"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"firstName"}},{"kind":"Field","name":{"kind":"Name","value":"lastName"}},{"kind":"Field","name":{"kind":"Name","value":"taxResidency"}},{"kind":"Field","name":{"kind":"Name","value":"role"}},{"kind":"Field","name":{"kind":"Name","value":"discordLinked"}}]}},{"kind":"Field","name":{"kind":"Name","value":"notificationChannels"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"label"}},{"kind":"Field","name":{"kind":"Name","value":"isActive"}},{"kind":"Field","name":{"kind":"Name","value":"events"}},{"kind":"Field","name":{"kind":"Name","value":"webhookUrlPreview"}}]}}]}}]} as unknown as DocumentNode<SettingsQuery, SettingsQueryVariables>;
export const TaxPageDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"TaxPage"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"taxYear"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"portfolioId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"taxSummary"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"taxYear"},"value":{"kind":"Variable","name":{"kind":"Name","value":"taxYear"}}},{"kind":"Argument","name":{"kind":"Name","value":"portfolioId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"portfolioId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalIncomeTHB"}},{"kind":"Field","name":{"kind":"Name","value":"foreignIncomeTHB"}},{"kind":"Field","name":{"kind":"Name","value":"withheldTaxTHB"}},{"kind":"Field","name":{"kind":"Name","value":"repatriatedTHB"}},{"kind":"Field","name":{"kind":"Name","value":"pendingCount"}},{"kind":"Field","name":{"kind":"Name","value":"breakdown"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"taxType"}},{"kind":"Field","name":{"kind":"Name","value":"sourceCountry"}},{"kind":"Field","name":{"kind":"Name","value":"incomeTHB"}},{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"taxRecords"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"taxYear"},"value":{"kind":"Variable","name":{"kind":"Name","value":"taxYear"}}},{"kind":"Argument","name":{"kind":"Name","value":"portfolioId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"portfolioId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"portfolioId"}},{"kind":"Field","name":{"kind":"Name","value":"taxType"}},{"kind":"Field","name":{"kind":"Name","value":"sourceCountry"}},{"kind":"Field","name":{"kind":"Name","value":"incomeAmount"}},{"kind":"Field","name":{"kind":"Name","value":"convertedAmountTHB"}},{"kind":"Field","name":{"kind":"Name","value":"fxRate"}},{"kind":"Field","name":{"kind":"Name","value":"earnedYear"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"transaction"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"executedAt"}},{"kind":"Field","name":{"kind":"Name","value":"assetSymbol"}},{"kind":"Field","name":{"kind":"Name","value":"currency"}},{"kind":"Field","name":{"kind":"Name","value":"taxWithheld"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"myPortfolios"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"type"},"value":{"kind":"EnumValue","value":"REAL"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<TaxPageQuery, TaxPageQueryVariables>;
export const WatchlistStockDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"WatchlistStock"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"assetId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"asset"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"assetId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"symbol"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"exchange"}}]}},{"kind":"Field","name":{"kind":"Name","value":"investmentTheses"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"assetId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"assetId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"summary"}},{"kind":"Field","name":{"kind":"Name","value":"sections"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"content"}},{"kind":"Field","name":{"kind":"Name","value":"history"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"content"}},{"kind":"Field","name":{"kind":"Name","value":"savedAt"}}]}}]}}]}}]}}]} as unknown as DocumentNode<WatchlistStockQuery, WatchlistStockQueryVariables>;
export const WatchlistOverviewDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"WatchlistOverview"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"watchLists"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"items"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"asset"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"symbol"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"exchange"}}]}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"investmentTheses"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"assetId"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<WatchlistOverviewQuery, WatchlistOverviewQueryVariables>;
export const RefreshTokenDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"RefreshToken"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"refreshToken"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"refreshToken"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"refreshToken"},"value":{"kind":"Variable","name":{"kind":"Name","value":"refreshToken"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"accessToken"}},{"kind":"Field","name":{"kind":"Name","value":"refreshToken"}}]}}]}}]} as unknown as DocumentNode<RefreshTokenMutation, RefreshTokenMutationVariables>;