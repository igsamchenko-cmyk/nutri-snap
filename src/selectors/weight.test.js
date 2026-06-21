import { describe, it, expect } from 'vitest';
import {
  getLatestWeightEntry,
  getPreviousWeightEntry,
  getSortedWeightEntries,
  getWeightChange,
  getWeightChangeForRange,
  getWeightForDate,
  getWeightRange,
  getWeightStats,
  getWeightTrendData,
  normalizeWeightLog
} from './weight';

describe('weight selectors', () => {
  it('handles an empty weight log safely', () => {
    expect(normalizeWeightLog(null)).toEqual([]);
    expect(getSortedWeightEntries(undefined)).toEqual([]);
    expect(getLatestWeightEntry({})).toBeNull();
    expect(getPreviousWeightEntry({})).toBeNull();
    expect(getWeightForDate({}, '2026-06-20')).toBeNull();
    expect(getWeightRange({})).toEqual({ min: null, max: null, span: 0, hasRange: false });
    expect(getWeightChange({})).toMatchObject({ latest: null, previous: null, change: 0, hasChange: false });
  });

  it('normalizes and sorts date keys without mutating input', () => {
    const weightLog = {
      '2026-06-20': '81.9',
      '2026-06-18': 82.5,
      '2026-06-19': '82.1'
    };
    const original = { ...weightLog };

    expect(normalizeWeightLog(weightLog)).toEqual([
      { date: '2026-06-18', weight: 82.5 },
      { date: '2026-06-19', weight: 82.1 },
      { date: '2026-06-20', weight: 81.9 }
    ]);
    expect(weightLog).toEqual(original);
  });

  it('returns latest and previous entries', () => {
    const weightLog = {
      '2026-06-18': 83,
      '2026-06-20': 82.2,
      '2026-06-19': 82.5
    };

    expect(getLatestWeightEntry(weightLog)).toEqual({ date: '2026-06-20', weight: 82.2 });
    expect(getPreviousWeightEntry(weightLog)).toEqual({ date: '2026-06-19', weight: 82.5 });
  });

  it('handles a single entry without inventing a change', () => {
    const weightLog = { '2026-06-20': 82.2 };

    expect(getLatestWeightEntry(weightLog)).toEqual({ date: '2026-06-20', weight: 82.2 });
    expect(getPreviousWeightEntry(weightLog)).toBeNull();
    expect(getWeightChange(weightLog)).toMatchObject({ change: 0, totalChange: 0, hasChange: false });
  });

  it('computes latest and total weight changes', () => {
    const weightLog = {
      '2026-06-18': 83,
      '2026-06-19': 82.5,
      '2026-06-20': 82.2
    };

    expect(getWeightChange(weightLog)).toMatchObject({
      latest: { date: '2026-06-20', weight: 82.2 },
      previous: { date: '2026-06-19', weight: 82.5 },
      first: { date: '2026-06-18', weight: 83 },
      change: -0.3,
      totalChange: -0.8,
      hasChange: true
    });
  });

  it('ignores invalid dates and weight values', () => {
    const weightLog = {
      '2026-06-18': 82.5,
      '2026-06-19': null,
      '2026-06-20': undefined,
      '2026-06-21': '',
      '2026-06-22': 'not-a-number',
      '2026-06-23': -1,
      '2026-06-24': 0,
      'bad-date': 81
    };

    expect(normalizeWeightLog(weightLog)).toEqual([{ date: '2026-06-18', weight: 82.5 }]);
  });

  it('supports array-shaped logs defensively', () => {
    const weightLog = [
      { date: '2026-06-20', weight: '81.9' },
      { dateStr: '2026-06-18', value: 82.5 },
      { createdAt: 'bad-date', weight: 82 }
    ];

    expect(normalizeWeightLog(weightLog)).toEqual([
      { date: '2026-06-18', weight: 82.5 },
      { date: '2026-06-20', weight: 81.9 }
    ]);
  });

  it('gets weight for a specific date', () => {
    const weightLog = {
      '2026-06-18': 83,
      '2026-06-20': 82.2
    };

    expect(getWeightForDate(weightLog, '2026-06-20')).toBe(82.2);
    expect(getWeightForDate(weightLog, '2026-06-19')).toBeNull();
    expect(getWeightForDate(weightLog, 'invalid')).toBeNull();
  });

  it('computes inclusive range changes and supports reversed dates', () => {
    const weightLog = {
      '2026-06-17': 84,
      '2026-06-18': 83,
      '2026-06-19': 82.5,
      '2026-06-20': 82.2
    };

    expect(getWeightChangeForRange(weightLog, '2026-06-18', '2026-06-20')).toMatchObject({
      first: { date: '2026-06-18', weight: 83 },
      latest: { date: '2026-06-20', weight: 82.2 },
      previous: { date: '2026-06-19', weight: 82.5 },
      change: -0.3,
      totalChange: -0.8,
      hasChange: true
    });

    expect(getWeightChangeForRange(weightLog, '2026-06-20', '2026-06-18')).toMatchObject({
      first: { date: '2026-06-18', weight: 83 },
      latest: { date: '2026-06-20', weight: 82.2 }
    });
  });

  it('builds trend data in chronological order', () => {
    const result = getWeightTrendData({
      '2026-06-18': 82,
      '2026-06-20': 81
    }, {
      endDate: '2026-06-20',
      days: 3,
      locale: 'en-US'
    });

    expect(result.days.map(day => day.dateStr)).toEqual(['2026-06-18', '2026-06-19', '2026-06-20']);
    expect(result.days.map(day => day.weight)).toEqual([82, null, 81]);
    expect(result.points).toMatchObject([
      { x: 0, y: 82, dateStr: '2026-06-18', weight: 82 },
      { x: 2, y: 81, dateStr: '2026-06-20', weight: 81 }
    ]);
    expect(result.trend).toMatchObject({ hasTrend: true, pointsCount: 2 });
    expect(result.trend.slope).toBeCloseTo(-0.5);
    expect(result.trend.intercept).toBeCloseTo(82);
  });

  it('does not report a trend with fewer than two logged points', () => {
    const result = getWeightTrendData({ '2026-06-20': 81 }, {
      endDate: '2026-06-20',
      days: 3,
      locale: 'en-US'
    });

    expect(result.points).toHaveLength(1);
    expect(result.trend).toEqual({ slope: 0, intercept: 0, hasTrend: false, pointsCount: 1 });
  });

  it('computes range and stats for valid entries only', () => {
    const weightLog = {
      '2026-06-18': 83,
      '2026-06-19': 82.5,
      '2026-06-20': 82.2,
      '2026-06-21': 'bad'
    };

    expect(getWeightRange(weightLog)).toEqual({ min: 82.2, max: 83, span: 0.8, hasRange: true });
    expect(getWeightStats(weightLog)).toMatchObject({
      count: 3,
      latest: { date: '2026-06-20', weight: 82.2 },
      previous: { date: '2026-06-19', weight: 82.5 },
      change: -0.3,
      totalChange: -0.8,
      average: 82.6,
      range: { min: 82.2, max: 83, span: 0.8, hasRange: true }
    });
  });
});
