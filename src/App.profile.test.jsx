// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';

vi.mock('./services/openFoodFactsService', () => ({
  getProductByBarcode: vi.fn().mockResolvedValue(null),
  searchProductsByName: vi.fn().mockResolvedValue([])
}));

const legacyProfile = {
  weight: 70,
  height: 170,
  age: 25,
  gender: 'male',
  activityLevel: 'moderate',
  goal: 'maintain',
  targetCalories: 2000,
  targetProtein: 150,
  targetFat: 55,
  targetCarbs: 225,
  targetWater: 2100
};

const openProfile = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Профіль', exact: true }));
};

beforeEach(() => {
  const values = new Map();
  vi.stubGlobal('localStorage', {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    clear: () => values.clear(),
    get length() { return values.size; },
    key: index => [...values.keys()][index] ?? null
  });
  localStorage.setItem('nutrisnap_profile', JSON.stringify(legacyProfile));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('manual nutrition targets', () => {
  it('keeps every manually entered target independent and persists it', async () => {
    render(<App />);
    openProfile();

    fireEvent.change(screen.getByLabelText('План калорій, ккал'), { target: { value: '2150' } });
    fireEvent.change(screen.getByLabelText('План білків, г'), { target: { value: '135' } });
    fireEvent.change(screen.getByLabelText('План жирів, г'), { target: { value: '70' } });
    fireEvent.change(screen.getByLabelText('План вуглеводів, г'), { target: { value: '240' } });
    fireEvent.change(screen.getByLabelText('Вага профілю, кг'), { target: { value: '80' } });

    expect(screen.getByLabelText('План калорій, ккал').value).toBe('2150');
    expect(screen.getByLabelText('План білків, г').value).toBe('135');
    expect(screen.getByLabelText('План жирів, г').value).toBe('70');
    expect(screen.getByLabelText('План вуглеводів, г').value).toBe('240');

    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem('nutrisnap_profile'))).toMatchObject({
        weight: '80',
        targetCalories: 2150,
        targetProtein: 135,
        targetFat: 70,
        targetCarbs: 240,
        targetsMode: 'manual'
      });
    });

    cleanup();
    render(<App />);
    openProfile();
    expect(screen.getByLabelText('План калорій, ккал').value).toBe('2150');
    expect(screen.getByLabelText('План білків, г').value).toBe('135');
    expect(screen.getByLabelText('План жирів, г').value).toBe('70');
    expect(screen.getByLabelText('План вуглеводів, г').value).toBe('240');
  });

  it('recalculates targets only after the explicit automatic action', async () => {
    render(<App />);
    openProfile();

    expect(screen.getByText(/Денні нормативи - власний план/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Розрахувати цілі за профілем' }));

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('nutrisnap_profile'));
      expect(saved.targetsMode).toBe('auto');
      expect(saved.targetCalories).not.toBe(legacyProfile.targetCalories);
    });
    expect(screen.getByText(/Денні нормативи - автоматичний розрахунок/)).toBeTruthy();
  });

  it('shows every input used by the automatic formula and persists changes', async () => {
    render(<App />);
    openProfile();

    fireEvent.change(screen.getByLabelText('Вік профілю'), { target: { value: '34' } });
    fireEvent.change(screen.getByLabelText('Стать для розрахунку'), { target: { value: 'female' } });
    fireEvent.change(screen.getByLabelText('Рівень активності'), { target: { value: 'light' } });

    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem('nutrisnap_profile'))).toMatchObject({
        age: '34',
        gender: 'female',
        activityLevel: 'light',
        targetsMode: 'manual'
      });
    });
  });

  it('switches a manual profile to automatic targets when weight recalculation is confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App />);
    openProfile();

    fireEvent.change(screen.getByLabelText('Вага для запису, кг'), { target: { value: '80' } });
    fireEvent.click(screen.getByRole('button', { name: 'Записати на сьогодні' }));

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('nutrisnap_profile'));
      expect(saved.weight).toBe(80);
      expect(saved.targetsMode).toBe('auto');
      expect(saved.targetCalories).not.toBe(legacyProfile.targetCalories);
    });
  });
});
