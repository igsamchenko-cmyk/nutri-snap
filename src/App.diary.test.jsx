// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import App from './App';
import {
  searchCachedProductsByName,
  searchProductsByName
} from './services/openFoodFactsService';

vi.mock('./services/openFoodFactsService', () => ({
  getProductByBarcode: vi.fn().mockResolvedValue(null),
  searchCachedProductsByName: vi.fn().mockResolvedValue([]),
  searchProductsByName: vi.fn().mockResolvedValue([])
}));

const readMeals = () => JSON.parse(localStorage.getItem('nutrisnap_meals') || '[]');
const selectFirstFood = container => {
  const row = container.querySelector('.search-food-item');
  expect(row).not.toBeNull();
  fireEvent.click(row);
  return screen.getByRole('dialog');
};

beforeEach(() => {
  vi.clearAllMocks();
  searchCachedProductsByName.mockResolvedValue([]);
  searchProductsByName.mockResolvedValue([]);
  const values = new Map();
  vi.stubGlobal('localStorage', {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    clear: () => values.clear(),
    get length() { return values.size; },
    key: index => [...values.keys()][index] ?? null,
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', ''); } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.removeAttribute('open'); } });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('diary food entry', () => {
  it('filters the product catalogue by a separate product category', async () => {
    const { container } = render(<App />);
    fireEvent.click(container.querySelector('.scan-fab'));
    fireEvent.change(screen.getByLabelText('Категорія:'), {
      target: { value: 'Риба та морепродукти' }
    });

    await waitFor(() => {
      const rows = [...container.querySelectorAll('.search-food-item')];
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every(row => row.textContent.includes('Риба та морепродукти'))).toBe(true);
    });
  });

  it('waits for a second character before searching the large catalogue', async () => {
    const { container } = render(<App />);
    fireEvent.click(container.querySelector('.scan-fab'));

    fireEvent.change(screen.getByLabelText('Пошук продуктів'), {
      target: { value: 'р' }
    });

    await waitFor(() => {
      expect(container.querySelectorAll('.search-food-item')).toHaveLength(0);
      expect(screen.getByText('Введіть ще один символ для пошуку у великій базі.')).toBeTruthy();
    });
  });

  it('does not render background catalogue rows while a custom name is edited', () => {
    localStorage.setItem('nutrisnap_custom_foods', JSON.stringify([{
      id: 'custom-mobile-edit',
      name: 'Мій тестовий продукт',
      weight: 100,
      calories: 120,
      protein: 10,
      fat: 4,
      carbs: 12,
      per100g: { calories: 120, protein: 10, fat: 4, carbs: 12 }
    }]));

    const { container } = render(<App />);
    fireEvent.click(container.querySelector('.scan-fab'));
    expect(container.querySelectorAll('.search-food-item').length).toBeGreaterThan(0);

    fireEvent.click(container.querySelector('.search-edit-btn'));
    expect(container.querySelectorAll('.search-food-item')).toHaveLength(0);

    const nameInput = screen.getByPlaceholderText('Наприклад: Вівсянка звичайна');
    fireEvent.change(nameInput, { target: { value: 'Мій виправлений продукт' } });

    expect(nameInput.value).toBe('Мій виправлений продукт');
    expect(container.querySelectorAll('.search-food-item')).toHaveLength(0);
  });

  it('uses complete nutrition returned by explicit Open Food Facts search', async () => {
    searchProductsByName.mockResolvedValue([{
      id: 'off-4820000000004',
      barcode: '4820000000004',
      name: 'Тест - Кефір 2,5%',
      brand: 'Тест',
      calories: 50,
      protein: 3,
      fat: 2.5,
      carbs: 4,
      per100g: { calories: 50, protein: 3, fat: 2.5, carbs: 4 },
      nutritionBasis: '100g',
      weight: 100,
      source: 'openfoodfacts',
      sourceLabel: 'Open Food Facts',
      dataQuality: 'database'
    }]);

    const { container } = render(<App />);
    fireEvent.click(container.querySelector('.scan-fab'));
    fireEvent.change(screen.getByLabelText('Пошук продуктів'), { target: { value: 'кефір тест' } });

    await waitFor(
      () => expect(searchCachedProductsByName).toHaveBeenCalledWith('кефір тест'),
      { timeout: 3000 }
    );
    expect(searchProductsByName).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Знайти у великій базі продуктів' }));
    await waitFor(() => expect(searchProductsByName).toHaveBeenCalledWith('кефір тест'));

    fireEvent.click(screen.getByText('Тест - Кефір 2,5%').closest('.search-food-item'));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Додати й завершити' }));

    await waitFor(() => expect(readMeals()).toHaveLength(1));
    expect(readMeals()[0]).toMatchObject({
      name: 'Тест - Кефір 2,5%',
      calories: 50,
      protein: 3,
      fat: 2.5,
      carbs: 4,
      source: 'barcode_off'
    });
  });

  it('adds actual selected foods to lunch and keeps the date and category when adding another', async () => {
    const { container } = render(<App />);
    fireEvent.change(screen.getByLabelText('Дата щоденника'), { target: { value: '2026-08-20' } });
    fireEvent.click(screen.getByTitle('Додати до: Обід'));
    let dialog = selectFirstFood(container);
    const name = within(dialog).getByRole('heading').textContent;
    fireEvent.change(within(dialog).getByLabelText('Вага порції, г'), { target: { value: '150,5' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Додати й обрати ще' }));
    await waitFor(() => expect(readMeals()).toHaveLength(1));
    expect(readMeals()[0]).toMatchObject({ name, weight: 150.5, category: 'Обід', date: '2026-08-20' });
    expect(readMeals()[0].calories).toBeGreaterThan(0);
    expect(screen.getByLabelText('Прийом їжі для додавання').value).toBe('Обід');

    dialog = selectFirstFood(container);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Додати й завершити' }));
    await waitFor(() => expect(readMeals()).toHaveLength(2));
    expect(readMeals().every(meal => meal.name && meal.category === 'Обід' && meal.date === '2026-08-20')).toBe(true);
    expect(screen.getByRole('region', { name: 'Підсумок дня' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Скасувати', exact: true }));
    await waitFor(() => expect(readMeals()).toHaveLength(1));
  });

  it('does not persist an unfinished edit and saves weight and meal changes together', async () => {
    localStorage.setItem('nutrisnap_meals', JSON.stringify([{
      id: 'existing', date: '2026-08-20', name: 'Мій обід', category: 'Обід',
      weight: 100, calories: 200, protein: 10, fat: 8, carbs: 20
    }]));
    render(<App />);
    fireEvent.change(screen.getByLabelText('Дата щоденника'), { target: { value: '2026-08-20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Змінити порцію: Мій обід' }));
    fireEvent.change(screen.getByLabelText('Вага порції, г'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Закрити порцію' }));
    expect(readMeals()[0]).toMatchObject({ weight: 100, calories: 200 });
    fireEvent.click(screen.getByRole('button', { name: 'Змінити порцію: Мій обід' }));
    fireEvent.change(screen.getByLabelText('Вага порції, г'), { target: { value: '200' } });
    fireEvent.change(screen.getByLabelText('Прийом їжі', { exact: true }), { target: { value: 'Вечеря' } });
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти зміни' }));
    await waitFor(() => expect(readMeals()[0]).toMatchObject({ weight: 200, calories: 400, category: 'Вечеря', mealType: 'Вечеря' }));
  });

  it('returns from the global add button to the screen that opened it', () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Профіль', exact: true }));
    fireEvent.click(container.querySelector('.scan-fab'));
    fireEvent.click(screen.getByRole('button', { name: 'Назад', exact: true }));
    expect(screen.getByRole('heading', { name: 'Профіль', exact: true })).toBeTruthy();
  });
});

