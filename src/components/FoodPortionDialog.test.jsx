// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import FoodPortionDialog from './FoodPortionDialog';

const dialogMethods = {};

beforeAll(() => {
  for (const method of ['showModal', 'close']) {
    dialogMethods[method] = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, method);
  }
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value() { this.setAttribute('open', ''); }
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value() { this.removeAttribute('open'); }
  });
});

afterEach(cleanup);

afterAll(() => {
  for (const method of ['showModal', 'close']) {
    if (dialogMethods[method]) {
      Object.defineProperty(HTMLDialogElement.prototype, method, dialogMethods[method]);
    } else {
      delete HTMLDialogElement.prototype[method];
    }
  }
});

const food = {
  id: 'test-food', name: 'Йогурт', brand: 'Тестовий бренд',
  weight: 100, calories: 200, protein: 20, fat: 10, carbs: 15
};

function openDialog(overrides = {}) {
  const props = {
    food, initialWeight: 200, initialCategory: 'Обід', dateLabel: '5 вересня 2026',
    onClose: vi.fn(), onSave: vi.fn(), ...overrides
  };
  render(<FoodPortionDialog {...props} />);
  return props;
}

describe('FoodPortionDialog', () => {
  it.each(['', ' ', '0', '-2', '5000.1', 'abc'])('does not save invalid or cleared weight %j', value => {
    const { onSave } = openDialog();
    const input = screen.getByLabelText('Вага порції, г');
    fireEvent.change(input, { target: { value } });

    const finish = screen.getByRole('button', { name: 'Додати й завершити' });
    const more = screen.getByRole('button', { name: 'Додати й обрати ще' });
    expect(input.value).toBe(value);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Вкажіть вагу від 1 до 5000 г.')).toBeTruthy();
    expect(finish.disabled).toBe(true);
    expect(more.disabled).toBe(true);
    fireEvent.click(finish);
    fireEvent.click(more);
    fireEvent.submit(input.closest('form'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('accepts a decimal comma, scales nutrition, and saves parsed grams', () => {
    const { onSave } = openDialog();
    fireEvent.change(screen.getByLabelText('Вага порції, г'), { target: { value: '150,5' } });

    expect(screen.getByText('301')).toBeTruthy();
    expect(within(screen.getByText('Білки').parentElement).getByText('30.1 г')).toBeTruthy();
    expect(within(screen.getByText('Жири').parentElement).getByText('15.1 г')).toBeTruthy();
    expect(within(screen.getByText('Вуглеводи').parentElement).getByText('22.6 г')).toBeTruthy();
    expect(screen.getByLabelText('Вага порції, г').getAttribute('aria-invalid')).toBe('false');
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Додати й завершити' }));
    expect(onSave).toHaveBeenCalledExactlyOnceWith(150.5, 'Обід', false);
  });

  it('uses explicit per-100g nutrition instead of package weight for an external product', () => {
    openDialog({
      food: {
        id: 'off-yogurt',
        name: 'Йогурт з OFF',
        source: 'openfoodfacts',
        weight: 500,
        packageWeight: 500,
        calories: 100,
        protein: 5,
        fat: 2,
        carbs: 15,
        per100g: { calories: 100, protein: 5, fat: 2, carbs: 15 }
      },
      initialWeight: 100
    });

    expect(screen.getByText('На 100 г: 100 ккал')).toBeTruthy();
    expect(within(document.querySelector('.portion-total')).getByText('100')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Вага порції, г'), { target: { value: '200' } });
    expect(within(document.querySelector('.portion-total')).getByText('200')).toBeTruthy();
    expect(within(screen.getByText('Білки').parentElement).getByText('10 г')).toBeTruthy();
  });

  it('preserves the selected diary date and meal while the portion changes', () => {
    const { onSave } = openDialog({ initialCategory: 'Вечеря', dateLabel: 'Учора, 5 вересня' });
    expect(screen.getByRole('dialog', { name: 'Йогурт' })).toBeTruthy();
    expect(screen.getByLabelText('Прийом їжі').value).toBe('Вечеря');
    fireEvent.click(screen.getByRole('button', { name: '150 г' }));
    expect(screen.getByText('Учора, 5 вересня')).toBeTruthy();
    expect(screen.getByLabelText('Прийом їжі').value).toBe('Вечеря');
    expect(screen.getByLabelText('Вага порції, г').value).toBe('150');
    fireEvent.click(screen.getByRole('button', { name: 'Додати й завершити' }));
    expect(onSave).toHaveBeenCalledExactlyOnceWith(150, 'Вечеря', false);
  });

  it('passes the changed meal category and stay-open choice and prevents duplicate submissions', () => {
    const { onSave } = openDialog();
    fireEvent.change(screen.getByLabelText('Прийом їжі'), { target: { value: 'Другий перекус' } });
    fireEvent.change(screen.getByLabelText('Вага порції, г'), { target: { value: '75' } });
    const addMore = screen.getByRole('button', { name: 'Додати й обрати ще' });
    fireEvent.click(addMore);
    fireEvent.click(addMore);
    fireEvent.click(screen.getByRole('button', { name: 'Додати й завершити' }));
    expect(onSave).toHaveBeenCalledExactlyOnceWith(75, 'Другий перекус', true);
  });

  it('allows valid input after clearing a field without saving the temporary empty value', () => {
    const { onSave } = openDialog();
    const input = screen.getByLabelText('Вага порції, г');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.change(input, { target: { value: '125' } });
    expect(screen.queryByText('Вкажіть вагу від 1 до 5000 г.')).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.submit(input.closest('form'));
    expect(onSave).toHaveBeenCalledExactlyOnceWith(125, 'Обід', false);
  });

  it.each(['close button', 'native cancel'])('cancels through %s without saving changes', mode => {
    const { onSave, onClose } = openDialog();
    fireEvent.change(screen.getByLabelText('Вага порції, г'), { target: { value: '350' } });
    fireEvent.change(screen.getByLabelText('Прийом їжі'), { target: { value: 'Вечеря' } });
    if (mode === 'close button') {
      fireEvent.click(screen.getByRole('button', { name: 'Закрити порцію' }));
    } else {
      fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    }
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
    expect(food.weight).toBe(100);
  });
});
