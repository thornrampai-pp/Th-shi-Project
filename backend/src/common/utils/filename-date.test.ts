import { describe, it, expect } from 'vitest';
import { dateFromFileName, sortByDateThenName } from './filename-date';

const iso = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;

describe('dateFromFileName', () => {
  it('reads DDMMYYYY (Dime fund notes)', () => {
    expect(iso(dateFromFileName('2766_10032024.pdf'))).toBe('2024-03-10');
    expect(iso(dateFromFileName('2766_10072024.pdf'))).toBe('2024-07-10');
  });

  it('reads Dime\'s DDMMYYYY + HHMMSS names, time included', () => {
    expect(dateFromFileName('Dime_mutual_fund_confirmationNote_2766_11072023094550.pdf')?.toISOString()).toBe(
      '2023-07-11T09:45:50.000Z',
    );
  });

  it('orders same-day files by their time', () => {
    const a = dateFromFileName('x_2766_12042023094532.pdf')!;
    const b = dateFromFileName('x_2766_12042023101500.pdf')!;
    expect(a.getTime()).toBeLessThan(b.getTime());
  });

  it('falls back to YYYYMMDD', () => {
    expect(iso(dateFromFileName('confirm_20241031.pdf'))).toBe('2024-10-31');
  });

  it('converts Buddhist-era years', () => {
    expect(iso(dateFromFileName('note_10032567.pdf'))).toBe('2024-03-10');
  });

  it('rejects impossible dates and names without one', () => {
    expect(dateFromFileName('x_31022024.pdf')).toBeNull();
    expect(dateFromFileName('statement.pdf')).toBeNull();
    expect(dateFromFileName('order_2202307100010512.pdf')).toBeNull(); // 16 digits, not a date
  });
});

describe('sortByDateThenName', () => {
  it('orders by date, not by name, with undated files last', () => {
    const files = ['2766_10072024.pdf', 'misc.pdf', '2766_10032024.pdf', '2766_05032024.pdf'].map((name) => ({
      name,
      date: dateFromFileName(name),
    }));
    expect(sortByDateThenName(files).map((f) => f.name)).toEqual([
      '2766_05032024.pdf',
      '2766_10032024.pdf',
      '2766_10072024.pdf',
      'misc.pdf',
    ]);
  });

  it('keeps same-day files in natural name order', () => {
    const d = new Date('2024-03-10');
    const files = [
      { name: 'b-10.pdf', date: d },
      { name: 'b-9.pdf', date: d },
    ];
    expect(sortByDateThenName(files).map((f) => f.name)).toEqual(['b-9.pdf', 'b-10.pdf']);
  });
});
