import { describe, it, expect, vi } from 'vitest';
import { postLedgerEntries, LedgerEntryInput, LedgerTxClient } from './ledger.service';

function createMockTx(): LedgerTxClient {
  return {
    ledgerEntry: {
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'le_mock', ...data })),
    },
    cashAccount: {
      update: vi.fn().mockResolvedValue({}),
    },
  };
}

describe('postLedgerEntries', () => {
  it('rejects an empty batch', async () => {
    const tx = createMockTx();
    await expect(postLedgerEntries(tx, 'tx1', [])).rejects.toThrow();
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
  });

  it('rejects a non-positive amount before touching the DB', async () => {
    const tx = createMockTx();
    const entries: LedgerEntryInput[] = [
      { portfolioId: 'p1', accountType: 'CASH', side: 'DEBIT', amount: 0, assetSymbol: 'USD', cashAccountId: 'ca1' },
    ];
    await expect(postLedgerEntries(tx, 'tx1', entries)).rejects.toThrow(/positive/);
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
  });

  it('rejects a CASH entry missing cashAccountId', async () => {
    const tx = createMockTx();
    const entries: LedgerEntryInput[] = [
      { portfolioId: 'p1', accountType: 'CASH', side: 'DEBIT', amount: 100, assetSymbol: 'USD' },
    ];
    await expect(postLedgerEntries(tx, 'tx1', entries)).rejects.toThrow(/cashAccountId/);
  });

  it('rejects entries that do not balance', async () => {
    const tx = createMockTx();
    const entries: LedgerEntryInput[] = [
      { portfolioId: 'p1', accountType: 'CASH', side: 'DEBIT', amount: 100, assetSymbol: 'USD', cashAccountId: 'ca1' },
      { portfolioId: 'p1', accountType: 'ASSET', side: 'CREDIT', amount: 90, assetSymbol: 'AAPL', assetId: 'a1' },
    ];
    await expect(postLedgerEntries(tx, 'tx1', entries)).rejects.toThrow(/do not balance/);
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
  });

  it('accepts a balanced BUY posting and updates the cash account by the correct signed amount', async () => {
    const tx = createMockTx();
    const entries: LedgerEntryInput[] = [
      { portfolioId: 'p1', accountType: 'CASH', side: 'CREDIT', amount: 1500, assetSymbol: 'USD', cashAccountId: 'ca1' },
      { portfolioId: 'p1', accountType: 'ASSET', side: 'DEBIT', amount: 1500, assetSymbol: 'AAPL', assetId: 'a1' },
    ];

    const result = await postLedgerEntries(tx, 'tx1', entries);

    expect(result).toHaveLength(2);
    expect(tx.ledgerEntry.create).toHaveBeenCalledTimes(2);
    // CREDIT on a CASH account means money leaving — balance decreases.
    expect(tx.cashAccount.update).toHaveBeenCalledWith({
      where: { id: 'ca1' },
      data: { balance: { increment: -1500 } },
    });
  });

  it('does not reject a balanced posting due to binary floating point rounding', async () => {
    const tx = createMockTx();
    const entries: LedgerEntryInput[] = [
      { portfolioId: 'p1', accountType: 'CASH', side: 'DEBIT', amount: 10.1, assetSymbol: 'USD', cashAccountId: 'ca1' },
      { portfolioId: 'p1', accountType: 'CASH', side: 'DEBIT', amount: 0.2, assetSymbol: 'USD', cashAccountId: 'ca1' },
      { portfolioId: 'p1', accountType: 'ASSET', side: 'CREDIT', amount: 10.3, assetSymbol: 'AAPL', assetId: 'a1' },
    ];

    // 10.1 + 0.2 === 10.300000000000001 in raw JS float math — this must still pass.
    await expect(postLedgerEntries(tx, 'tx1', entries)).resolves.toHaveLength(3);
  });
});
