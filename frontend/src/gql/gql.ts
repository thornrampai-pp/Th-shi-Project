/* eslint-disable */
import * as types from './graphql';
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "\n  mutation CreateAlert($assetId: ID!, $condition: AlertCondition!, $targetValue: Float!) {\n    createAlert(assetId: $assetId, condition: $condition, targetValue: $targetValue) {\n      id\n    }\n  }\n": typeof types.CreateAlertDocument,
    "\n  mutation UpdateAlert($id: ID!, $isActive: Boolean) {\n    updateAlert(id: $id, isActive: $isActive) {\n      id\n    }\n  }\n": typeof types.UpdateAlertDocument,
    "\n  mutation DeleteAlert($id: ID!) {\n    deleteAlert(id: $id)\n  }\n": typeof types.DeleteAlertDocument,
    "\n  mutation Login($email: String!, $password: String!) {\n    login(email: $email, password: $password) {\n      accessToken\n      refreshToken\n    }\n  }\n": typeof types.LoginDocument,
    "\n  mutation Register($email: String!, $password: String!, $firstName: String, $lastName: String) {\n    register(email: $email, password: $password, firstName: $firstName, lastName: $lastName) {\n      accessToken\n      refreshToken\n    }\n  }\n": typeof types.RegisterDocument,
    "\n  mutation Logout($refreshToken: String!) {\n    logout(refreshToken: $refreshToken)\n  }\n": typeof types.LogoutDocument,
    "\n  mutation CreatePortfolio(\n    $name: String!\n    $strategy: StrategyType!\n    $baseCurrency: String!\n    $type: PortfolioType!\n    $initialPaperBalance: Float\n  ) {\n    createPortfolio(\n      name: $name\n      strategy: $strategy\n      baseCurrency: $baseCurrency\n      type: $type\n      initialPaperBalance: $initialPaperBalance\n    ) {\n      id\n    }\n  }\n": typeof types.CreatePortfolioDocument,
    "\n  mutation AddAssetToPortfolio(\n    $portfolioId: ID!\n    $assetId: ID!\n    $quantity: Float!\n    $price: Float!\n    $fee: Float\n    $executedAt: String\n    $fundWithDeposit: Boolean\n  ) {\n    createTransaction(\n      portfolioId: $portfolioId\n      type: BUY\n      assetId: $assetId\n      quantity: $quantity\n      price: $price\n      fee: $fee\n      executedAt: $executedAt\n      fundWithDeposit: $fundWithDeposit\n    ) {\n      id\n    }\n  }\n": typeof types.AddAssetToPortfolioDocument,
    "\n  query PortfolioCashAccounts($portfolioId: ID!) {\n    cashAccounts(portfolioId: $portfolioId) {\n      currency\n    }\n  }\n": typeof types.PortfolioCashAccountsDocument,
    "\n  mutation AddCashAccount($portfolioId: ID!, $currency: String!, $isDomestic: Boolean) {\n    addCashAccount(portfolioId: $portfolioId, currency: $currency, isDomestic: $isDomestic) {\n      id\n    }\n  }\n": typeof types.AddCashAccountDocument,
    "\n  mutation RecordTransaction(\n    $portfolioId: ID!\n    $type: TransactionType!\n    $assetId: ID\n    $quantity: Float\n    $price: Float\n    $amount: Float\n    $currency: String\n    $fee: Float\n    $taxWithheld: Float\n    $note: String\n    $executedAt: String\n  ) {\n    createTransaction(\n      portfolioId: $portfolioId\n      type: $type\n      assetId: $assetId\n      quantity: $quantity\n      price: $price\n      amount: $amount\n      currency: $currency\n      fee: $fee\n      taxWithheld: $taxWithheld\n      note: $note\n      executedAt: $executedAt\n    ) {\n      id\n    }\n  }\n": typeof types.RecordTransactionDocument,
    "\n  mutation UpdateProfile($firstName: String, $lastName: String, $taxResidency: String) {\n    updateProfile(firstName: $firstName, lastName: $lastName, taxResidency: $taxResidency) {\n      id\n    }\n  }\n": typeof types.UpdateProfileDocument,
    "\n  mutation ChangePassword($oldPassword: String!, $newPassword: String!) {\n    changePassword(oldPassword: $oldPassword, newPassword: $newPassword)\n  }\n": typeof types.ChangePasswordDocument,
    "\n  query MeEmail {\n    me {\n      email\n    }\n  }\n": typeof types.MeEmailDocument,
    "\n  mutation ReLogin($email: String!, $password: String!) {\n    login(email: $email, password: $password) {\n      accessToken\n      refreshToken\n    }\n  }\n": typeof types.ReLoginDocument,
    "\n  mutation GenerateDiscordLinkCode {\n    generateDiscordLinkCode\n  }\n": typeof types.GenerateDiscordLinkCodeDocument,
    "\n  mutation ConnectDiscordChannel($webhookUrl: String!, $label: String, $events: [NotificationEventType!]!) {\n    connectDiscordChannel(webhookUrl: $webhookUrl, label: $label, events: $events) {\n      id\n    }\n  }\n": typeof types.ConnectDiscordChannelDocument,
    "\n  mutation UpdateNotificationChannel($id: ID!, $isActive: Boolean, $events: [NotificationEventType!]) {\n    updateNotificationChannel(id: $id, isActive: $isActive, events: $events) {\n      id\n    }\n  }\n": typeof types.UpdateNotificationChannelDocument,
    "\n  mutation TestNotificationChannel($id: ID!) {\n    testNotificationChannel(id: $id)\n  }\n": typeof types.TestNotificationChannelDocument,
    "\n  mutation RemoveNotificationChannel($id: ID!) {\n    removeNotificationChannel(id: $id)\n  }\n": typeof types.RemoveNotificationChannelDocument,
    "\n  mutation UpdateTaxRecordStatus($id: ID!, $status: TaxStatus) {\n    updateTaxRecord(id: $id, status: $status) {\n      id\n    }\n  }\n": typeof types.UpdateTaxRecordStatusDocument,
    "\n  query CalculatePersonalIncomeTax($input: PersonalIncomeTaxInput!) {\n    calculatePersonalIncomeTax(input: $input) {\n      taxYear\n      totalIncome\n      expenses\n      totalDeductions\n      netIncome\n      brackets {\n        from\n        upTo\n        rate\n        taxableAmount\n        tax\n      }\n      grossTax\n      taxCredits\n      taxPayable\n      refund\n      effectiveRate\n      marginalRate\n      disclaimer\n    }\n  }\n": typeof types.CalculatePersonalIncomeTaxDocument,
    "\n  query WatchListIds {\n    watchLists {\n      id\n    }\n  }\n": typeof types.WatchListIdsDocument,
    "\n  mutation CreateWatchList($name: String!) {\n    createWatchList(name: $name) {\n      id\n    }\n  }\n": typeof types.CreateWatchListDocument,
    "\n  mutation AddWatchListItem($watchListId: ID!, $assetId: ID!) {\n    addWatchListItem(watchListId: $watchListId, assetId: $assetId) {\n      id\n    }\n  }\n": typeof types.AddWatchListItemDocument,
    "\n  mutation RemoveWatchListItem($watchListId: ID!, $assetId: ID!) {\n    removeWatchListItem(watchListId: $watchListId, assetId: $assetId) {\n      id\n    }\n  }\n": typeof types.RemoveWatchListItemDocument,
    "\n  query SearchAssets($search: String!) {\n    assets(search: $search, limit: 8) {\n      id\n      symbol\n      name\n      type\n      exchange\n      currency\n    }\n  }\n": typeof types.SearchAssetsDocument,
    "\n  query LookupSymbol($symbol: String!) {\n    searchAssetSymbol(symbol: $symbol) {\n      id\n      symbol\n      name\n      type\n      exchange\n      currency\n    }\n  }\n": typeof types.LookupSymbolDocument,
    "\n  mutation CreateThesis($assetId: ID!, $title: String!) {\n    createInvestmentThesis(assetId: $assetId, title: $title) {\n      id\n    }\n  }\n": typeof types.CreateThesisDocument,
    "\n  mutation UpdateThesis($id: ID!, $input: InvestmentThesisInput!) {\n    updateInvestmentThesis(id: $id, input: $input) {\n      id\n    }\n  }\n": typeof types.UpdateThesisDocument,
    "\n  mutation AddThesisSection($thesisId: ID!, $title: String!) {\n    addThesisSection(thesisId: $thesisId, title: $title) {\n      id\n    }\n  }\n": typeof types.AddThesisSectionDocument,
    "\n  mutation UpdateThesisSection($id: ID!, $title: String, $content: String) {\n    updateThesisSection(id: $id, title: $title, content: $content) {\n      id\n    }\n  }\n": typeof types.UpdateThesisSectionDocument,
    "\n  mutation DeleteThesisSection($id: ID!) {\n    deleteThesisSection(id: $id)\n  }\n": typeof types.DeleteThesisSectionDocument,
    "\n  query Alerts {\n    alerts {\n      id\n      condition\n      targetValue\n      isActive\n      updatedAt\n      asset {\n        id\n        symbol\n        name\n        type\n        exchange\n      }\n    }\n  }\n": typeof types.AlertsDocument,
    "\n  query AppShellMe {\n    me {\n      email\n      firstName\n    }\n    dataSyncedAt\n  }\n": typeof types.AppShellMeDocument,
    "\n  mutation AutoMatchSlips($images: [SlipImageInput!]!, $portfolioId: ID) {\n    autoMatchSlips(images: $images, portfolioId: $portfolioId) {\n      status\n      message\n      transactionId\n      isAmountMatched\n      amount\n      currency\n      transRef\n      assetSymbol\n      candidateIds\n    }\n  }\n": typeof types.AutoMatchSlipsDocument,
    "\n  fragment PortfolioHoldingsFields on PortfolioHoldings {\n    portfolioId\n    name\n    strategy\n    type\n    currency\n    cash\n    equity\n    marketValue\n    costBasis\n    unrealizedPL\n    unrealizedPLPct\n    realizedPL\n    holdings {\n      assetId\n      symbol\n      name\n      assetCurrency\n      quantity\n      avgPrice\n      marketPrice\n      priceSource\n      priceAsOf\n      marketValue\n      costBasis\n      unrealizedPL\n      unrealizedPLPct\n      weight\n    }\n  }\n": typeof types.PortfolioHoldingsFieldsFragmentDoc,
    "\n  query PortfolioOverview {\n    portfolioOverview {\n      currency\n      marketValue\n      costBasis\n      unrealizedPL\n      unrealizedPLPct\n      realizedPL\n      portfolios {\n        ...PortfolioHoldingsFields\n      }\n    }\n  }\n": typeof types.PortfolioOverviewDocument,
    "\n  query PortfolioList {\n    myPortfolios {\n      id\n      name\n      type\n      createdAt\n    }\n  }\n": typeof types.PortfolioListDocument,
    "\n  query PortfolioHoldings($portfolioId: ID!) {\n    portfolioHoldings(portfolioId: $portfolioId) {\n      ...PortfolioHoldingsFields\n    }\n  }\n": typeof types.PortfolioHoldingsDocument,
    "\n  query PortfolioTransactions($portfolioId: ID!) {\n    transactions(portfolioId: $portfolioId, limit: 200) {\n      id\n      type\n      executedAt\n      assetSymbol\n      mainAssetId\n      mainQuantity\n      mainPrice\n      baseCurrAmount\n      currency\n      fee\n      taxWithheld\n      realizedPL\n      note\n      hasSlip\n    }\n    cashAccounts(portfolioId: $portfolioId) {\n      id\n      currency\n      balance\n      isDomestic\n    }\n  }\n": typeof types.PortfolioTransactionsDocument,
    "\n  query Settings {\n    me {\n      email\n      firstName\n      lastName\n      taxResidency\n      role\n      discordLinked\n    }\n    notificationChannels {\n      id\n      label\n      isActive\n      events\n      webhookUrlPreview\n    }\n  }\n": typeof types.SettingsDocument,
    "\n  query TaxPage($taxYear: Int!, $portfolioId: ID) {\n    taxSummary(taxYear: $taxYear, portfolioId: $portfolioId) {\n      totalIncomeTHB\n      foreignIncomeTHB\n      withheldTaxTHB\n      repatriatedTHB\n      pendingCount\n      breakdown {\n        taxType\n        sourceCountry\n        incomeTHB\n        count\n      }\n    }\n    taxRecords(taxYear: $taxYear, portfolioId: $portfolioId) {\n      id\n      portfolioId\n      taxType\n      sourceCountry\n      incomeAmount\n      convertedAmountTHB\n      fxRate\n      earnedYear\n      status\n      transaction {\n        executedAt\n        assetSymbol\n        currency\n        taxWithheld\n      }\n    }\n    myPortfolios(type: REAL) {\n      id\n      name\n    }\n  }\n": typeof types.TaxPageDocument,
    "\n  query AssetInsights($assetId: ID!) {\n    assetInsights(assetId: $assetId) {\n      currency\n      price\n      marketCap\n      trailingPE\n      forwardPE\n      priceToBook\n      eps\n      dividendYieldPct\n      beta\n      roePct\n      debtToEquityPct\n      profitMarginPct\n      revenueGrowthPct\n      freeCashflow\n      nextEarningsDate\n      exDividendDate\n      targetMeanPrice\n      recommendation\n      analystCount\n      analystTrend {\n        strongBuy\n        buy\n        hold\n        sell\n        strongSell\n      }\n      sector\n      industry\n      website\n      businessSummary\n      fetchedAt\n    }\n  }\n": typeof types.AssetInsightsDocument,
    "\n  query WatchlistStock($assetId: ID!) {\n    asset(id: $assetId) {\n      id\n      symbol\n      name\n      type\n      exchange\n    }\n    investmentTheses(assetId: $assetId) {\n      id\n      status\n      summary\n      sections {\n        id\n        title\n        content\n        history {\n          id\n          content\n          savedAt\n        }\n      }\n    }\n  }\n": typeof types.WatchlistStockDocument,
    "\n  query WatchlistOverview {\n    watchLists {\n      id\n      items {\n        id\n        createdAt\n        asset {\n          id\n          symbol\n          name\n          type\n          exchange\n        }\n      }\n    }\n    investmentTheses {\n      assetId\n      status\n      updatedAt\n    }\n  }\n": typeof types.WatchlistOverviewDocument,
    "\n  mutation RefreshToken($refreshToken: String!) {\n    refreshToken(refreshToken: $refreshToken) {\n      accessToken\n      refreshToken\n    }\n  }\n": typeof types.RefreshTokenDocument,
};
const documents: Documents = {
    "\n  mutation CreateAlert($assetId: ID!, $condition: AlertCondition!, $targetValue: Float!) {\n    createAlert(assetId: $assetId, condition: $condition, targetValue: $targetValue) {\n      id\n    }\n  }\n": types.CreateAlertDocument,
    "\n  mutation UpdateAlert($id: ID!, $isActive: Boolean) {\n    updateAlert(id: $id, isActive: $isActive) {\n      id\n    }\n  }\n": types.UpdateAlertDocument,
    "\n  mutation DeleteAlert($id: ID!) {\n    deleteAlert(id: $id)\n  }\n": types.DeleteAlertDocument,
    "\n  mutation Login($email: String!, $password: String!) {\n    login(email: $email, password: $password) {\n      accessToken\n      refreshToken\n    }\n  }\n": types.LoginDocument,
    "\n  mutation Register($email: String!, $password: String!, $firstName: String, $lastName: String) {\n    register(email: $email, password: $password, firstName: $firstName, lastName: $lastName) {\n      accessToken\n      refreshToken\n    }\n  }\n": types.RegisterDocument,
    "\n  mutation Logout($refreshToken: String!) {\n    logout(refreshToken: $refreshToken)\n  }\n": types.LogoutDocument,
    "\n  mutation CreatePortfolio(\n    $name: String!\n    $strategy: StrategyType!\n    $baseCurrency: String!\n    $type: PortfolioType!\n    $initialPaperBalance: Float\n  ) {\n    createPortfolio(\n      name: $name\n      strategy: $strategy\n      baseCurrency: $baseCurrency\n      type: $type\n      initialPaperBalance: $initialPaperBalance\n    ) {\n      id\n    }\n  }\n": types.CreatePortfolioDocument,
    "\n  mutation AddAssetToPortfolio(\n    $portfolioId: ID!\n    $assetId: ID!\n    $quantity: Float!\n    $price: Float!\n    $fee: Float\n    $executedAt: String\n    $fundWithDeposit: Boolean\n  ) {\n    createTransaction(\n      portfolioId: $portfolioId\n      type: BUY\n      assetId: $assetId\n      quantity: $quantity\n      price: $price\n      fee: $fee\n      executedAt: $executedAt\n      fundWithDeposit: $fundWithDeposit\n    ) {\n      id\n    }\n  }\n": types.AddAssetToPortfolioDocument,
    "\n  query PortfolioCashAccounts($portfolioId: ID!) {\n    cashAccounts(portfolioId: $portfolioId) {\n      currency\n    }\n  }\n": types.PortfolioCashAccountsDocument,
    "\n  mutation AddCashAccount($portfolioId: ID!, $currency: String!, $isDomestic: Boolean) {\n    addCashAccount(portfolioId: $portfolioId, currency: $currency, isDomestic: $isDomestic) {\n      id\n    }\n  }\n": types.AddCashAccountDocument,
    "\n  mutation RecordTransaction(\n    $portfolioId: ID!\n    $type: TransactionType!\n    $assetId: ID\n    $quantity: Float\n    $price: Float\n    $amount: Float\n    $currency: String\n    $fee: Float\n    $taxWithheld: Float\n    $note: String\n    $executedAt: String\n  ) {\n    createTransaction(\n      portfolioId: $portfolioId\n      type: $type\n      assetId: $assetId\n      quantity: $quantity\n      price: $price\n      amount: $amount\n      currency: $currency\n      fee: $fee\n      taxWithheld: $taxWithheld\n      note: $note\n      executedAt: $executedAt\n    ) {\n      id\n    }\n  }\n": types.RecordTransactionDocument,
    "\n  mutation UpdateProfile($firstName: String, $lastName: String, $taxResidency: String) {\n    updateProfile(firstName: $firstName, lastName: $lastName, taxResidency: $taxResidency) {\n      id\n    }\n  }\n": types.UpdateProfileDocument,
    "\n  mutation ChangePassword($oldPassword: String!, $newPassword: String!) {\n    changePassword(oldPassword: $oldPassword, newPassword: $newPassword)\n  }\n": types.ChangePasswordDocument,
    "\n  query MeEmail {\n    me {\n      email\n    }\n  }\n": types.MeEmailDocument,
    "\n  mutation ReLogin($email: String!, $password: String!) {\n    login(email: $email, password: $password) {\n      accessToken\n      refreshToken\n    }\n  }\n": types.ReLoginDocument,
    "\n  mutation GenerateDiscordLinkCode {\n    generateDiscordLinkCode\n  }\n": types.GenerateDiscordLinkCodeDocument,
    "\n  mutation ConnectDiscordChannel($webhookUrl: String!, $label: String, $events: [NotificationEventType!]!) {\n    connectDiscordChannel(webhookUrl: $webhookUrl, label: $label, events: $events) {\n      id\n    }\n  }\n": types.ConnectDiscordChannelDocument,
    "\n  mutation UpdateNotificationChannel($id: ID!, $isActive: Boolean, $events: [NotificationEventType!]) {\n    updateNotificationChannel(id: $id, isActive: $isActive, events: $events) {\n      id\n    }\n  }\n": types.UpdateNotificationChannelDocument,
    "\n  mutation TestNotificationChannel($id: ID!) {\n    testNotificationChannel(id: $id)\n  }\n": types.TestNotificationChannelDocument,
    "\n  mutation RemoveNotificationChannel($id: ID!) {\n    removeNotificationChannel(id: $id)\n  }\n": types.RemoveNotificationChannelDocument,
    "\n  mutation UpdateTaxRecordStatus($id: ID!, $status: TaxStatus) {\n    updateTaxRecord(id: $id, status: $status) {\n      id\n    }\n  }\n": types.UpdateTaxRecordStatusDocument,
    "\n  query CalculatePersonalIncomeTax($input: PersonalIncomeTaxInput!) {\n    calculatePersonalIncomeTax(input: $input) {\n      taxYear\n      totalIncome\n      expenses\n      totalDeductions\n      netIncome\n      brackets {\n        from\n        upTo\n        rate\n        taxableAmount\n        tax\n      }\n      grossTax\n      taxCredits\n      taxPayable\n      refund\n      effectiveRate\n      marginalRate\n      disclaimer\n    }\n  }\n": types.CalculatePersonalIncomeTaxDocument,
    "\n  query WatchListIds {\n    watchLists {\n      id\n    }\n  }\n": types.WatchListIdsDocument,
    "\n  mutation CreateWatchList($name: String!) {\n    createWatchList(name: $name) {\n      id\n    }\n  }\n": types.CreateWatchListDocument,
    "\n  mutation AddWatchListItem($watchListId: ID!, $assetId: ID!) {\n    addWatchListItem(watchListId: $watchListId, assetId: $assetId) {\n      id\n    }\n  }\n": types.AddWatchListItemDocument,
    "\n  mutation RemoveWatchListItem($watchListId: ID!, $assetId: ID!) {\n    removeWatchListItem(watchListId: $watchListId, assetId: $assetId) {\n      id\n    }\n  }\n": types.RemoveWatchListItemDocument,
    "\n  query SearchAssets($search: String!) {\n    assets(search: $search, limit: 8) {\n      id\n      symbol\n      name\n      type\n      exchange\n      currency\n    }\n  }\n": types.SearchAssetsDocument,
    "\n  query LookupSymbol($symbol: String!) {\n    searchAssetSymbol(symbol: $symbol) {\n      id\n      symbol\n      name\n      type\n      exchange\n      currency\n    }\n  }\n": types.LookupSymbolDocument,
    "\n  mutation CreateThesis($assetId: ID!, $title: String!) {\n    createInvestmentThesis(assetId: $assetId, title: $title) {\n      id\n    }\n  }\n": types.CreateThesisDocument,
    "\n  mutation UpdateThesis($id: ID!, $input: InvestmentThesisInput!) {\n    updateInvestmentThesis(id: $id, input: $input) {\n      id\n    }\n  }\n": types.UpdateThesisDocument,
    "\n  mutation AddThesisSection($thesisId: ID!, $title: String!) {\n    addThesisSection(thesisId: $thesisId, title: $title) {\n      id\n    }\n  }\n": types.AddThesisSectionDocument,
    "\n  mutation UpdateThesisSection($id: ID!, $title: String, $content: String) {\n    updateThesisSection(id: $id, title: $title, content: $content) {\n      id\n    }\n  }\n": types.UpdateThesisSectionDocument,
    "\n  mutation DeleteThesisSection($id: ID!) {\n    deleteThesisSection(id: $id)\n  }\n": types.DeleteThesisSectionDocument,
    "\n  query Alerts {\n    alerts {\n      id\n      condition\n      targetValue\n      isActive\n      updatedAt\n      asset {\n        id\n        symbol\n        name\n        type\n        exchange\n      }\n    }\n  }\n": types.AlertsDocument,
    "\n  query AppShellMe {\n    me {\n      email\n      firstName\n    }\n    dataSyncedAt\n  }\n": types.AppShellMeDocument,
    "\n  mutation AutoMatchSlips($images: [SlipImageInput!]!, $portfolioId: ID) {\n    autoMatchSlips(images: $images, portfolioId: $portfolioId) {\n      status\n      message\n      transactionId\n      isAmountMatched\n      amount\n      currency\n      transRef\n      assetSymbol\n      candidateIds\n    }\n  }\n": types.AutoMatchSlipsDocument,
    "\n  fragment PortfolioHoldingsFields on PortfolioHoldings {\n    portfolioId\n    name\n    strategy\n    type\n    currency\n    cash\n    equity\n    marketValue\n    costBasis\n    unrealizedPL\n    unrealizedPLPct\n    realizedPL\n    holdings {\n      assetId\n      symbol\n      name\n      assetCurrency\n      quantity\n      avgPrice\n      marketPrice\n      priceSource\n      priceAsOf\n      marketValue\n      costBasis\n      unrealizedPL\n      unrealizedPLPct\n      weight\n    }\n  }\n": types.PortfolioHoldingsFieldsFragmentDoc,
    "\n  query PortfolioOverview {\n    portfolioOverview {\n      currency\n      marketValue\n      costBasis\n      unrealizedPL\n      unrealizedPLPct\n      realizedPL\n      portfolios {\n        ...PortfolioHoldingsFields\n      }\n    }\n  }\n": types.PortfolioOverviewDocument,
    "\n  query PortfolioList {\n    myPortfolios {\n      id\n      name\n      type\n      createdAt\n    }\n  }\n": types.PortfolioListDocument,
    "\n  query PortfolioHoldings($portfolioId: ID!) {\n    portfolioHoldings(portfolioId: $portfolioId) {\n      ...PortfolioHoldingsFields\n    }\n  }\n": types.PortfolioHoldingsDocument,
    "\n  query PortfolioTransactions($portfolioId: ID!) {\n    transactions(portfolioId: $portfolioId, limit: 200) {\n      id\n      type\n      executedAt\n      assetSymbol\n      mainAssetId\n      mainQuantity\n      mainPrice\n      baseCurrAmount\n      currency\n      fee\n      taxWithheld\n      realizedPL\n      note\n      hasSlip\n    }\n    cashAccounts(portfolioId: $portfolioId) {\n      id\n      currency\n      balance\n      isDomestic\n    }\n  }\n": types.PortfolioTransactionsDocument,
    "\n  query Settings {\n    me {\n      email\n      firstName\n      lastName\n      taxResidency\n      role\n      discordLinked\n    }\n    notificationChannels {\n      id\n      label\n      isActive\n      events\n      webhookUrlPreview\n    }\n  }\n": types.SettingsDocument,
    "\n  query TaxPage($taxYear: Int!, $portfolioId: ID) {\n    taxSummary(taxYear: $taxYear, portfolioId: $portfolioId) {\n      totalIncomeTHB\n      foreignIncomeTHB\n      withheldTaxTHB\n      repatriatedTHB\n      pendingCount\n      breakdown {\n        taxType\n        sourceCountry\n        incomeTHB\n        count\n      }\n    }\n    taxRecords(taxYear: $taxYear, portfolioId: $portfolioId) {\n      id\n      portfolioId\n      taxType\n      sourceCountry\n      incomeAmount\n      convertedAmountTHB\n      fxRate\n      earnedYear\n      status\n      transaction {\n        executedAt\n        assetSymbol\n        currency\n        taxWithheld\n      }\n    }\n    myPortfolios(type: REAL) {\n      id\n      name\n    }\n  }\n": types.TaxPageDocument,
    "\n  query AssetInsights($assetId: ID!) {\n    assetInsights(assetId: $assetId) {\n      currency\n      price\n      marketCap\n      trailingPE\n      forwardPE\n      priceToBook\n      eps\n      dividendYieldPct\n      beta\n      roePct\n      debtToEquityPct\n      profitMarginPct\n      revenueGrowthPct\n      freeCashflow\n      nextEarningsDate\n      exDividendDate\n      targetMeanPrice\n      recommendation\n      analystCount\n      analystTrend {\n        strongBuy\n        buy\n        hold\n        sell\n        strongSell\n      }\n      sector\n      industry\n      website\n      businessSummary\n      fetchedAt\n    }\n  }\n": types.AssetInsightsDocument,
    "\n  query WatchlistStock($assetId: ID!) {\n    asset(id: $assetId) {\n      id\n      symbol\n      name\n      type\n      exchange\n    }\n    investmentTheses(assetId: $assetId) {\n      id\n      status\n      summary\n      sections {\n        id\n        title\n        content\n        history {\n          id\n          content\n          savedAt\n        }\n      }\n    }\n  }\n": types.WatchlistStockDocument,
    "\n  query WatchlistOverview {\n    watchLists {\n      id\n      items {\n        id\n        createdAt\n        asset {\n          id\n          symbol\n          name\n          type\n          exchange\n        }\n      }\n    }\n    investmentTheses {\n      assetId\n      status\n      updatedAt\n    }\n  }\n": types.WatchlistOverviewDocument,
    "\n  mutation RefreshToken($refreshToken: String!) {\n    refreshToken(refreshToken: $refreshToken) {\n      accessToken\n      refreshToken\n    }\n  }\n": types.RefreshTokenDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = graphql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function graphql(source: string): unknown;

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CreateAlert($assetId: ID!, $condition: AlertCondition!, $targetValue: Float!) {\n    createAlert(assetId: $assetId, condition: $condition, targetValue: $targetValue) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation CreateAlert($assetId: ID!, $condition: AlertCondition!, $targetValue: Float!) {\n    createAlert(assetId: $assetId, condition: $condition, targetValue: $targetValue) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateAlert($id: ID!, $isActive: Boolean) {\n    updateAlert(id: $id, isActive: $isActive) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateAlert($id: ID!, $isActive: Boolean) {\n    updateAlert(id: $id, isActive: $isActive) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DeleteAlert($id: ID!) {\n    deleteAlert(id: $id)\n  }\n"): (typeof documents)["\n  mutation DeleteAlert($id: ID!) {\n    deleteAlert(id: $id)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation Login($email: String!, $password: String!) {\n    login(email: $email, password: $password) {\n      accessToken\n      refreshToken\n    }\n  }\n"): (typeof documents)["\n  mutation Login($email: String!, $password: String!) {\n    login(email: $email, password: $password) {\n      accessToken\n      refreshToken\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation Register($email: String!, $password: String!, $firstName: String, $lastName: String) {\n    register(email: $email, password: $password, firstName: $firstName, lastName: $lastName) {\n      accessToken\n      refreshToken\n    }\n  }\n"): (typeof documents)["\n  mutation Register($email: String!, $password: String!, $firstName: String, $lastName: String) {\n    register(email: $email, password: $password, firstName: $firstName, lastName: $lastName) {\n      accessToken\n      refreshToken\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation Logout($refreshToken: String!) {\n    logout(refreshToken: $refreshToken)\n  }\n"): (typeof documents)["\n  mutation Logout($refreshToken: String!) {\n    logout(refreshToken: $refreshToken)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CreatePortfolio(\n    $name: String!\n    $strategy: StrategyType!\n    $baseCurrency: String!\n    $type: PortfolioType!\n    $initialPaperBalance: Float\n  ) {\n    createPortfolio(\n      name: $name\n      strategy: $strategy\n      baseCurrency: $baseCurrency\n      type: $type\n      initialPaperBalance: $initialPaperBalance\n    ) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation CreatePortfolio(\n    $name: String!\n    $strategy: StrategyType!\n    $baseCurrency: String!\n    $type: PortfolioType!\n    $initialPaperBalance: Float\n  ) {\n    createPortfolio(\n      name: $name\n      strategy: $strategy\n      baseCurrency: $baseCurrency\n      type: $type\n      initialPaperBalance: $initialPaperBalance\n    ) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation AddAssetToPortfolio(\n    $portfolioId: ID!\n    $assetId: ID!\n    $quantity: Float!\n    $price: Float!\n    $fee: Float\n    $executedAt: String\n    $fundWithDeposit: Boolean\n  ) {\n    createTransaction(\n      portfolioId: $portfolioId\n      type: BUY\n      assetId: $assetId\n      quantity: $quantity\n      price: $price\n      fee: $fee\n      executedAt: $executedAt\n      fundWithDeposit: $fundWithDeposit\n    ) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation AddAssetToPortfolio(\n    $portfolioId: ID!\n    $assetId: ID!\n    $quantity: Float!\n    $price: Float!\n    $fee: Float\n    $executedAt: String\n    $fundWithDeposit: Boolean\n  ) {\n    createTransaction(\n      portfolioId: $portfolioId\n      type: BUY\n      assetId: $assetId\n      quantity: $quantity\n      price: $price\n      fee: $fee\n      executedAt: $executedAt\n      fundWithDeposit: $fundWithDeposit\n    ) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query PortfolioCashAccounts($portfolioId: ID!) {\n    cashAccounts(portfolioId: $portfolioId) {\n      currency\n    }\n  }\n"): (typeof documents)["\n  query PortfolioCashAccounts($portfolioId: ID!) {\n    cashAccounts(portfolioId: $portfolioId) {\n      currency\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation AddCashAccount($portfolioId: ID!, $currency: String!, $isDomestic: Boolean) {\n    addCashAccount(portfolioId: $portfolioId, currency: $currency, isDomestic: $isDomestic) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation AddCashAccount($portfolioId: ID!, $currency: String!, $isDomestic: Boolean) {\n    addCashAccount(portfolioId: $portfolioId, currency: $currency, isDomestic: $isDomestic) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation RecordTransaction(\n    $portfolioId: ID!\n    $type: TransactionType!\n    $assetId: ID\n    $quantity: Float\n    $price: Float\n    $amount: Float\n    $currency: String\n    $fee: Float\n    $taxWithheld: Float\n    $note: String\n    $executedAt: String\n  ) {\n    createTransaction(\n      portfolioId: $portfolioId\n      type: $type\n      assetId: $assetId\n      quantity: $quantity\n      price: $price\n      amount: $amount\n      currency: $currency\n      fee: $fee\n      taxWithheld: $taxWithheld\n      note: $note\n      executedAt: $executedAt\n    ) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation RecordTransaction(\n    $portfolioId: ID!\n    $type: TransactionType!\n    $assetId: ID\n    $quantity: Float\n    $price: Float\n    $amount: Float\n    $currency: String\n    $fee: Float\n    $taxWithheld: Float\n    $note: String\n    $executedAt: String\n  ) {\n    createTransaction(\n      portfolioId: $portfolioId\n      type: $type\n      assetId: $assetId\n      quantity: $quantity\n      price: $price\n      amount: $amount\n      currency: $currency\n      fee: $fee\n      taxWithheld: $taxWithheld\n      note: $note\n      executedAt: $executedAt\n    ) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateProfile($firstName: String, $lastName: String, $taxResidency: String) {\n    updateProfile(firstName: $firstName, lastName: $lastName, taxResidency: $taxResidency) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateProfile($firstName: String, $lastName: String, $taxResidency: String) {\n    updateProfile(firstName: $firstName, lastName: $lastName, taxResidency: $taxResidency) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation ChangePassword($oldPassword: String!, $newPassword: String!) {\n    changePassword(oldPassword: $oldPassword, newPassword: $newPassword)\n  }\n"): (typeof documents)["\n  mutation ChangePassword($oldPassword: String!, $newPassword: String!) {\n    changePassword(oldPassword: $oldPassword, newPassword: $newPassword)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query MeEmail {\n    me {\n      email\n    }\n  }\n"): (typeof documents)["\n  query MeEmail {\n    me {\n      email\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation ReLogin($email: String!, $password: String!) {\n    login(email: $email, password: $password) {\n      accessToken\n      refreshToken\n    }\n  }\n"): (typeof documents)["\n  mutation ReLogin($email: String!, $password: String!) {\n    login(email: $email, password: $password) {\n      accessToken\n      refreshToken\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation GenerateDiscordLinkCode {\n    generateDiscordLinkCode\n  }\n"): (typeof documents)["\n  mutation GenerateDiscordLinkCode {\n    generateDiscordLinkCode\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation ConnectDiscordChannel($webhookUrl: String!, $label: String, $events: [NotificationEventType!]!) {\n    connectDiscordChannel(webhookUrl: $webhookUrl, label: $label, events: $events) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation ConnectDiscordChannel($webhookUrl: String!, $label: String, $events: [NotificationEventType!]!) {\n    connectDiscordChannel(webhookUrl: $webhookUrl, label: $label, events: $events) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateNotificationChannel($id: ID!, $isActive: Boolean, $events: [NotificationEventType!]) {\n    updateNotificationChannel(id: $id, isActive: $isActive, events: $events) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateNotificationChannel($id: ID!, $isActive: Boolean, $events: [NotificationEventType!]) {\n    updateNotificationChannel(id: $id, isActive: $isActive, events: $events) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation TestNotificationChannel($id: ID!) {\n    testNotificationChannel(id: $id)\n  }\n"): (typeof documents)["\n  mutation TestNotificationChannel($id: ID!) {\n    testNotificationChannel(id: $id)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation RemoveNotificationChannel($id: ID!) {\n    removeNotificationChannel(id: $id)\n  }\n"): (typeof documents)["\n  mutation RemoveNotificationChannel($id: ID!) {\n    removeNotificationChannel(id: $id)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateTaxRecordStatus($id: ID!, $status: TaxStatus) {\n    updateTaxRecord(id: $id, status: $status) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateTaxRecordStatus($id: ID!, $status: TaxStatus) {\n    updateTaxRecord(id: $id, status: $status) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query CalculatePersonalIncomeTax($input: PersonalIncomeTaxInput!) {\n    calculatePersonalIncomeTax(input: $input) {\n      taxYear\n      totalIncome\n      expenses\n      totalDeductions\n      netIncome\n      brackets {\n        from\n        upTo\n        rate\n        taxableAmount\n        tax\n      }\n      grossTax\n      taxCredits\n      taxPayable\n      refund\n      effectiveRate\n      marginalRate\n      disclaimer\n    }\n  }\n"): (typeof documents)["\n  query CalculatePersonalIncomeTax($input: PersonalIncomeTaxInput!) {\n    calculatePersonalIncomeTax(input: $input) {\n      taxYear\n      totalIncome\n      expenses\n      totalDeductions\n      netIncome\n      brackets {\n        from\n        upTo\n        rate\n        taxableAmount\n        tax\n      }\n      grossTax\n      taxCredits\n      taxPayable\n      refund\n      effectiveRate\n      marginalRate\n      disclaimer\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query WatchListIds {\n    watchLists {\n      id\n    }\n  }\n"): (typeof documents)["\n  query WatchListIds {\n    watchLists {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CreateWatchList($name: String!) {\n    createWatchList(name: $name) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation CreateWatchList($name: String!) {\n    createWatchList(name: $name) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation AddWatchListItem($watchListId: ID!, $assetId: ID!) {\n    addWatchListItem(watchListId: $watchListId, assetId: $assetId) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation AddWatchListItem($watchListId: ID!, $assetId: ID!) {\n    addWatchListItem(watchListId: $watchListId, assetId: $assetId) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation RemoveWatchListItem($watchListId: ID!, $assetId: ID!) {\n    removeWatchListItem(watchListId: $watchListId, assetId: $assetId) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation RemoveWatchListItem($watchListId: ID!, $assetId: ID!) {\n    removeWatchListItem(watchListId: $watchListId, assetId: $assetId) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query SearchAssets($search: String!) {\n    assets(search: $search, limit: 8) {\n      id\n      symbol\n      name\n      type\n      exchange\n      currency\n    }\n  }\n"): (typeof documents)["\n  query SearchAssets($search: String!) {\n    assets(search: $search, limit: 8) {\n      id\n      symbol\n      name\n      type\n      exchange\n      currency\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query LookupSymbol($symbol: String!) {\n    searchAssetSymbol(symbol: $symbol) {\n      id\n      symbol\n      name\n      type\n      exchange\n      currency\n    }\n  }\n"): (typeof documents)["\n  query LookupSymbol($symbol: String!) {\n    searchAssetSymbol(symbol: $symbol) {\n      id\n      symbol\n      name\n      type\n      exchange\n      currency\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CreateThesis($assetId: ID!, $title: String!) {\n    createInvestmentThesis(assetId: $assetId, title: $title) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation CreateThesis($assetId: ID!, $title: String!) {\n    createInvestmentThesis(assetId: $assetId, title: $title) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateThesis($id: ID!, $input: InvestmentThesisInput!) {\n    updateInvestmentThesis(id: $id, input: $input) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateThesis($id: ID!, $input: InvestmentThesisInput!) {\n    updateInvestmentThesis(id: $id, input: $input) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation AddThesisSection($thesisId: ID!, $title: String!) {\n    addThesisSection(thesisId: $thesisId, title: $title) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation AddThesisSection($thesisId: ID!, $title: String!) {\n    addThesisSection(thesisId: $thesisId, title: $title) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateThesisSection($id: ID!, $title: String, $content: String) {\n    updateThesisSection(id: $id, title: $title, content: $content) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateThesisSection($id: ID!, $title: String, $content: String) {\n    updateThesisSection(id: $id, title: $title, content: $content) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DeleteThesisSection($id: ID!) {\n    deleteThesisSection(id: $id)\n  }\n"): (typeof documents)["\n  mutation DeleteThesisSection($id: ID!) {\n    deleteThesisSection(id: $id)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Alerts {\n    alerts {\n      id\n      condition\n      targetValue\n      isActive\n      updatedAt\n      asset {\n        id\n        symbol\n        name\n        type\n        exchange\n      }\n    }\n  }\n"): (typeof documents)["\n  query Alerts {\n    alerts {\n      id\n      condition\n      targetValue\n      isActive\n      updatedAt\n      asset {\n        id\n        symbol\n        name\n        type\n        exchange\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query AppShellMe {\n    me {\n      email\n      firstName\n    }\n    dataSyncedAt\n  }\n"): (typeof documents)["\n  query AppShellMe {\n    me {\n      email\n      firstName\n    }\n    dataSyncedAt\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation AutoMatchSlips($images: [SlipImageInput!]!, $portfolioId: ID) {\n    autoMatchSlips(images: $images, portfolioId: $portfolioId) {\n      status\n      message\n      transactionId\n      isAmountMatched\n      amount\n      currency\n      transRef\n      assetSymbol\n      candidateIds\n    }\n  }\n"): (typeof documents)["\n  mutation AutoMatchSlips($images: [SlipImageInput!]!, $portfolioId: ID) {\n    autoMatchSlips(images: $images, portfolioId: $portfolioId) {\n      status\n      message\n      transactionId\n      isAmountMatched\n      amount\n      currency\n      transRef\n      assetSymbol\n      candidateIds\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment PortfolioHoldingsFields on PortfolioHoldings {\n    portfolioId\n    name\n    strategy\n    type\n    currency\n    cash\n    equity\n    marketValue\n    costBasis\n    unrealizedPL\n    unrealizedPLPct\n    realizedPL\n    holdings {\n      assetId\n      symbol\n      name\n      assetCurrency\n      quantity\n      avgPrice\n      marketPrice\n      priceSource\n      priceAsOf\n      marketValue\n      costBasis\n      unrealizedPL\n      unrealizedPLPct\n      weight\n    }\n  }\n"): (typeof documents)["\n  fragment PortfolioHoldingsFields on PortfolioHoldings {\n    portfolioId\n    name\n    strategy\n    type\n    currency\n    cash\n    equity\n    marketValue\n    costBasis\n    unrealizedPL\n    unrealizedPLPct\n    realizedPL\n    holdings {\n      assetId\n      symbol\n      name\n      assetCurrency\n      quantity\n      avgPrice\n      marketPrice\n      priceSource\n      priceAsOf\n      marketValue\n      costBasis\n      unrealizedPL\n      unrealizedPLPct\n      weight\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query PortfolioOverview {\n    portfolioOverview {\n      currency\n      marketValue\n      costBasis\n      unrealizedPL\n      unrealizedPLPct\n      realizedPL\n      portfolios {\n        ...PortfolioHoldingsFields\n      }\n    }\n  }\n"): (typeof documents)["\n  query PortfolioOverview {\n    portfolioOverview {\n      currency\n      marketValue\n      costBasis\n      unrealizedPL\n      unrealizedPLPct\n      realizedPL\n      portfolios {\n        ...PortfolioHoldingsFields\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query PortfolioList {\n    myPortfolios {\n      id\n      name\n      type\n      createdAt\n    }\n  }\n"): (typeof documents)["\n  query PortfolioList {\n    myPortfolios {\n      id\n      name\n      type\n      createdAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query PortfolioHoldings($portfolioId: ID!) {\n    portfolioHoldings(portfolioId: $portfolioId) {\n      ...PortfolioHoldingsFields\n    }\n  }\n"): (typeof documents)["\n  query PortfolioHoldings($portfolioId: ID!) {\n    portfolioHoldings(portfolioId: $portfolioId) {\n      ...PortfolioHoldingsFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query PortfolioTransactions($portfolioId: ID!) {\n    transactions(portfolioId: $portfolioId, limit: 200) {\n      id\n      type\n      executedAt\n      assetSymbol\n      mainAssetId\n      mainQuantity\n      mainPrice\n      baseCurrAmount\n      currency\n      fee\n      taxWithheld\n      realizedPL\n      note\n      hasSlip\n    }\n    cashAccounts(portfolioId: $portfolioId) {\n      id\n      currency\n      balance\n      isDomestic\n    }\n  }\n"): (typeof documents)["\n  query PortfolioTransactions($portfolioId: ID!) {\n    transactions(portfolioId: $portfolioId, limit: 200) {\n      id\n      type\n      executedAt\n      assetSymbol\n      mainAssetId\n      mainQuantity\n      mainPrice\n      baseCurrAmount\n      currency\n      fee\n      taxWithheld\n      realizedPL\n      note\n      hasSlip\n    }\n    cashAccounts(portfolioId: $portfolioId) {\n      id\n      currency\n      balance\n      isDomestic\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Settings {\n    me {\n      email\n      firstName\n      lastName\n      taxResidency\n      role\n      discordLinked\n    }\n    notificationChannels {\n      id\n      label\n      isActive\n      events\n      webhookUrlPreview\n    }\n  }\n"): (typeof documents)["\n  query Settings {\n    me {\n      email\n      firstName\n      lastName\n      taxResidency\n      role\n      discordLinked\n    }\n    notificationChannels {\n      id\n      label\n      isActive\n      events\n      webhookUrlPreview\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query TaxPage($taxYear: Int!, $portfolioId: ID) {\n    taxSummary(taxYear: $taxYear, portfolioId: $portfolioId) {\n      totalIncomeTHB\n      foreignIncomeTHB\n      withheldTaxTHB\n      repatriatedTHB\n      pendingCount\n      breakdown {\n        taxType\n        sourceCountry\n        incomeTHB\n        count\n      }\n    }\n    taxRecords(taxYear: $taxYear, portfolioId: $portfolioId) {\n      id\n      portfolioId\n      taxType\n      sourceCountry\n      incomeAmount\n      convertedAmountTHB\n      fxRate\n      earnedYear\n      status\n      transaction {\n        executedAt\n        assetSymbol\n        currency\n        taxWithheld\n      }\n    }\n    myPortfolios(type: REAL) {\n      id\n      name\n    }\n  }\n"): (typeof documents)["\n  query TaxPage($taxYear: Int!, $portfolioId: ID) {\n    taxSummary(taxYear: $taxYear, portfolioId: $portfolioId) {\n      totalIncomeTHB\n      foreignIncomeTHB\n      withheldTaxTHB\n      repatriatedTHB\n      pendingCount\n      breakdown {\n        taxType\n        sourceCountry\n        incomeTHB\n        count\n      }\n    }\n    taxRecords(taxYear: $taxYear, portfolioId: $portfolioId) {\n      id\n      portfolioId\n      taxType\n      sourceCountry\n      incomeAmount\n      convertedAmountTHB\n      fxRate\n      earnedYear\n      status\n      transaction {\n        executedAt\n        assetSymbol\n        currency\n        taxWithheld\n      }\n    }\n    myPortfolios(type: REAL) {\n      id\n      name\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query AssetInsights($assetId: ID!) {\n    assetInsights(assetId: $assetId) {\n      currency\n      price\n      marketCap\n      trailingPE\n      forwardPE\n      priceToBook\n      eps\n      dividendYieldPct\n      beta\n      roePct\n      debtToEquityPct\n      profitMarginPct\n      revenueGrowthPct\n      freeCashflow\n      nextEarningsDate\n      exDividendDate\n      targetMeanPrice\n      recommendation\n      analystCount\n      analystTrend {\n        strongBuy\n        buy\n        hold\n        sell\n        strongSell\n      }\n      sector\n      industry\n      website\n      businessSummary\n      fetchedAt\n    }\n  }\n"): (typeof documents)["\n  query AssetInsights($assetId: ID!) {\n    assetInsights(assetId: $assetId) {\n      currency\n      price\n      marketCap\n      trailingPE\n      forwardPE\n      priceToBook\n      eps\n      dividendYieldPct\n      beta\n      roePct\n      debtToEquityPct\n      profitMarginPct\n      revenueGrowthPct\n      freeCashflow\n      nextEarningsDate\n      exDividendDate\n      targetMeanPrice\n      recommendation\n      analystCount\n      analystTrend {\n        strongBuy\n        buy\n        hold\n        sell\n        strongSell\n      }\n      sector\n      industry\n      website\n      businessSummary\n      fetchedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query WatchlistStock($assetId: ID!) {\n    asset(id: $assetId) {\n      id\n      symbol\n      name\n      type\n      exchange\n    }\n    investmentTheses(assetId: $assetId) {\n      id\n      status\n      summary\n      sections {\n        id\n        title\n        content\n        history {\n          id\n          content\n          savedAt\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query WatchlistStock($assetId: ID!) {\n    asset(id: $assetId) {\n      id\n      symbol\n      name\n      type\n      exchange\n    }\n    investmentTheses(assetId: $assetId) {\n      id\n      status\n      summary\n      sections {\n        id\n        title\n        content\n        history {\n          id\n          content\n          savedAt\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query WatchlistOverview {\n    watchLists {\n      id\n      items {\n        id\n        createdAt\n        asset {\n          id\n          symbol\n          name\n          type\n          exchange\n        }\n      }\n    }\n    investmentTheses {\n      assetId\n      status\n      updatedAt\n    }\n  }\n"): (typeof documents)["\n  query WatchlistOverview {\n    watchLists {\n      id\n      items {\n        id\n        createdAt\n        asset {\n          id\n          symbol\n          name\n          type\n          exchange\n        }\n      }\n    }\n    investmentTheses {\n      assetId\n      status\n      updatedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation RefreshToken($refreshToken: String!) {\n    refreshToken(refreshToken: $refreshToken) {\n      accessToken\n      refreshToken\n    }\n  }\n"): (typeof documents)["\n  mutation RefreshToken($refreshToken: String!) {\n    refreshToken(refreshToken: $refreshToken) {\n      accessToken\n      refreshToken\n    }\n  }\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;