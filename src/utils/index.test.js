import { describe, it, expect } from 'vitest';
import {
  parseCsvText,
  normalizeImportHeader,
  getImportField,
  numberFromImport,
  aliasesFromImport,
  rowsFromProductImport,
  normalizeImportedProduct,
  parseLocalDate,
  getTodayString,
  createMealId,
  formatDateLabel,
  getDashboardTitle,
  calculateBMR,
  getActivityMultiplier
} from './index';

describe('General Utilities', () => {
  describe('CSV Parsing & Importing', () => {
    it('should parse simple CSV text correctly', () => {
      const csv = 'name,calories,protein\n"Яблуко",52,0.3\n"Банан",89,1.1';
      const parsed = parseCsvText(csv);
      expect(parsed).toEqual([
        ['name', 'calories', 'protein'],
        ['Яблуко', '52', '0.3'],
        ['Банан', '89', '1.1']
      ]);
    });

    it('should normalize import headers', () => {
      expect(normalizeImportHeader('\uFEFF Назва  ')).toBe('назва');
      expect(normalizeImportHeader('Калорії (ккал) ')).toBe('калорії (ккал)');
    });

    it('should retrieve import fields based on aliases', () => {
      const row = { 'назва': 'Гречка', 'калорії': '340' };
      expect(getImportField(row, 'name')).toBe('Гречка');
      expect(getImportField(row, 'calories')).toBe('340');
      expect(getImportField(row, 'nonexistent')).toBe('');
    });

    it('should parse number from import values with comma/dot conversions', () => {
      expect(numberFromImport('12,5')).toBe(12.5);
      expect(numberFromImport('100')).toBe(100);
      expect(numberFromImport('', 50)).toBe(50);
      expect(numberFromImport('abc', 10)).toBe(10);
    });

    it('should parse aliases split by semicolon or pipe', () => {
      expect(aliasesFromImport('яблуко; голден | зелене')).toEqual(['яблуко', 'голден', 'зелене']);
      expect(aliasesFromImport('')).toEqual([]);
    });

    it('should transform product import rows from CSV text', () => {
      const csv = 'Назва,Калорії\n"Куряче філе",110';
      const rows = rowsFromProductImport(csv, 'products.csv');
      expect(rows).toEqual([
        { 'назва': 'Куряче філе', 'калорії': '110' }
      ]);
    });

    it('should normalize imported products scaling macros to 100g base weight', () => {
      const row = { 'назва': 'Горіхи', 'вага': '50', 'калорії': '300', 'білки': '10' };
      const normalized = normalizeImportedProduct(row, 0);
      expect(normalized).not.toBeNull();
      expect(normalized.name).toBe('Горіхи');
      // scaling: 100 / 50 = 2x multiplier
      expect(normalized.calories).toBe(600);
      expect(normalized.protein).toBe(20);
      expect(normalized.weight).toBe(100);
    });
  });

  describe('Date & ID Handlers', () => {
    it('should parse local date correctly', () => {
      const date = parseLocalDate('2026-06-10');
      expect(date.getFullYear()).toBe(2026);
      expect(date.getMonth()).toBe(5); // June is 5 (0-indexed)
      expect(date.getDate()).toBe(10);
    });

    it('should generate today string in format YYYY-MM-DD', () => {
      const date = new Date(2026, 5, 10);
      expect(getTodayString(date)).toBe('2026-06-10');
    });

    it('should create valid meal IDs', () => {
      const id1 = createMealId();
      const id2 = createMealId();
      expect(id1).toBeTypeOf('string');
      expect(id1.length).toBeGreaterThan(5);
      expect(id1).not.toBe(id2);
    });

    it('should format date label relatively or in Ukrainian locale', () => {
      const todayStr = getTodayString();
      expect(formatDateLabel(todayStr)).toBe('Сьогодні');

      const fixedDateStr = '2025-06-10'; // 10 червня
      expect(formatDateLabel(fixedDateStr)).toBe('10 червня');
    });

    it('should generate appropriate dashboard titles', () => {
      const todayStr = getTodayString();
      expect(getDashboardTitle(todayStr)).toBe('Сьогоднішній огляд');
    });
  });

  describe('BMR & TDEE Computations', () => {
    it('should calculate BMR for male and female correctly using Harris-Benedict formula', () => {
      // Male: 88.362 + 13.397 * 80 + 4.799 * 180 - 5.677 * 30 = 88.362 + 1071.76 + 863.82 - 170.31 = 1853.632 ~ 1854
      expect(calculateBMR(80, 180, 30, 'male')).toBe(1854);
      // Female: 447.593 + 9.247 * 60 + 3.098 * 165 - 5.677 * 30 (wait, female uses 4.330 * age)
      // 447.593 + 9.247 * 60 + 3.098 * 165 - 4.330 * 30 = 447.593 + 554.82 + 511.17 - 129.9 = 1383.683 ~ 1384
      expect(calculateBMR(60, 165, 30, 'female')).toBe(1384);
    });

    it('should retrieve activity multiplier corresponding to level', () => {
      expect(getActivityMultiplier('sedentary')).toBe(1.2);
      expect(getActivityMultiplier('moderate')).toBe(1.55);
      expect(getActivityMultiplier('unknown')).toBe(1.55); // fallback
    });
  });
});
