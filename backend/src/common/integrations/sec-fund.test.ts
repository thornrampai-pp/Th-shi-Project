import { describe, it, expect } from 'vitest';
import {
  AmbiguousFundError,
  fundDisplayName,
  fundExternalId,
  matchFund,
  normalizeFundCode,
  parseFundExternalId,
  pickClass,
} from './sec-fund.util';
import type { SecFundNav, SecFundProfile } from './sec-fund.util';

function profile(over: Partial<SecFundProfile>): SecFundProfile {
  return {
    proj_id: 'M0001_2550',
    proj_abbr_name: 'K-2510',
    proj_name_th: 'กองทุนเปิดเค ไลฟ์สไตล์ 2510',
    proj_name_en: 'K LIFESTYLE FUND 2510',
    comp_name_th: null,
    comp_name_en: null,
    fund_status: 'Registered',
    cancel_date: null,
    fund_class_name: 'main',
    ...over,
  };
}

const usa = ['K-USA-A(A)', 'K-USA-A(D)', 'K-USA-SSF'].map((c) =>
  profile({ proj_id: 'M0159_2555', proj_abbr_name: 'K-USA', fund_class_name: c }),
);

describe('matchFund', () => {
  it('matches a single-class fund by its code, case-insensitively', () => {
    const match = matchFund('k-2510', [profile({})]);
    expect(match?.profile.proj_abbr_name).toBe('K-2510');
    expect(match?.className).toBeNull();
  });

  it('matches one unit class of a multi-class fund by class name', () => {
    const match = matchFund('K-USA-A(A)', usa);
    expect(match?.profile.proj_id).toBe('M0159_2555');
    expect(match?.className).toBe('K-USA-A(A)');
  });

  it('refuses to guess the class when a multi-class fund is named by its code', () => {
    expect(() => matchFund('K-USA', usa)).toThrow(AmbiguousFundError);
    try {
      matchFund('K-USA', usa);
    } catch (err) {
      expect((err as AmbiguousFundError).classes).toEqual(['K-USA-A(A)', 'K-USA-A(D)', 'K-USA-SSF']);
    }
  });

  it('ignores partial matches from the name search', () => {
    expect(matchFund('PTT', [profile({ proj_abbr_name: 'K-PTTDIV' })])).toBeNull();
    expect(matchFund('K-USA', [profile({ proj_abbr_name: 'K-USARMF' })])).toBeNull();
  });

  it('prefers the active fund when a code was reused', () => {
    const closed = profile({ proj_id: 'OLD', cancel_date: '2020-01-01' });
    const open = profile({ proj_id: 'NEW' });
    expect(matchFund('K-2510', [closed, open])?.profile.proj_id).toBe('NEW');
  });

  it('still finds a liquidated fund', () => {
    expect(matchFund('K-2510', [profile({ cancel_date: '2026-01-21' })])?.profile.cancel_date).toBe('2026-01-21');
  });
});

describe('pickClass', () => {
  const nav = (day: string, cls: string, val: number): SecFundNav => ({
    proj_id: 'M',
    fund_class_name: cls,
    nav_date: day,
    last_val: val,
  });

  it('keeps only the wanted class', () => {
    const rows = [nav('2026-11-02', 'K-USA-A(A)', 16.2), nav('2026-11-02', 'K-USA-A(D)', 11.2)];
    expect(pickClass(rows, 'K-USA-A(D)').map((r) => r.last_val)).toEqual([11.2]);
  });

  it('uses the main series for a fund named without a class', () => {
    const rows = [nav('2026-11-02', 'main', 17.5), nav('2026-11-02', 'other', 9)];
    expect(pickClass(rows).map((r) => r.last_val)).toEqual([17.5]);
  });

  it('drops unpriced rows', () => {
    expect(pickClass([nav('2026-01-21', 'main', 0)])).toEqual([]);
  });
});

describe('fund external ids', () => {
  it('round-trips with and without a class', () => {
    expect(parseFundExternalId(fundExternalId('M0159_2555', 'K-USA-A(A)'))).toEqual({
      projId: 'M0159_2555',
      className: 'K-USA-A(A)',
    });
    expect(parseFundExternalId(fundExternalId('M0209_2550', null))).toEqual({ projId: 'M0209_2550', className: null });
  });

  it('names a class asset after its class', () => {
    expect(fundDisplayName(profile({}), 'K-USA-A(A)')).toBe('กองทุนเปิดเค ไลฟ์สไตล์ 2510 (K-USA-A(A))');
    expect(normalizeFundCode(' k-usa-a(a) ')).toBe('K-USA-A(A)');
  });
});
