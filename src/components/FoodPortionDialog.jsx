import { useEffect, useRef, useState } from 'react';
import { Check, Pencil, Plus, Star, X } from 'lucide-react';

const categories = ['Сніданок', 'Перший перекус', 'Обід', 'Другий перекус', 'Вечеря'];
const parseWeight = value => Number(String(value).replace(',', '.'));

export default function FoodPortionDialog({ food, initialWeight, initialCategory, dateLabel, editing = false, favorite, onFavorite, onEdit, onClose, onSave }) {
  const dialogRef = useRef(null);
  const submitting = useRef(false);
  const [weight, setWeight] = useState(String(initialWeight || food.weight || 100));
  const [category, setCategory] = useState(initialCategory || 'Сніданок');
  const grams = parseWeight(weight);
  const valid = String(weight).trim() !== '' && Number.isFinite(grams) && grams >= 1 && grams <= 5000;
  const baseWeight = Number(food.weight) || 100;
  const factor = valid ? grams / baseWeight : 0;
  const nutrition = ['calories', 'protein', 'fat', 'carbs'].map(key => Math.round((Number(food[key]) || 0) * factor * (key === 'calories' ? 1 : 10)) / (key === 'calories' ? 1 : 10));

  useEffect(() => {
    const trigger = document.activeElement;
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => {
      dialog.close();
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);

  const save = stayOpen => {
    if (!valid || submitting.current) return;
    submitting.current = true;
    onSave(grams, category, stayOpen);
  };

  return (
    <dialog className="food-portion-dialog" ref={dialogRef} aria-labelledby="portion-title" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="portion-form" onSubmit={event => { event.preventDefault(); save(false); }}>
        <div className="portion-heading">
          <div><p>{editing ? 'Редагування запису' : 'Додати до щоденника'}</p><h2 id="portion-title">{food.name}</h2>{food.brand && <span>{food.brand}</span>}</div>
          <button type="button" className="portion-icon-button" onClick={onClose} aria-label="Закрити порцію"><X size={22} /></button>
        </div>
        <p className="portion-date">{dateLabel}</p>
        <label className="portion-field">Прийом їжі
          <select aria-label="Прийом їжі" value={category} onChange={event => setCategory(event.target.value)}>{categories.map(item => <option key={item}>{item}</option>)}</select>
        </label>
        <label className="portion-field" htmlFor="portion-grams">Вага порції, г</label>
        <div className="portion-weight-control">
          <input id="portion-grams" type="text" inputMode="decimal" autoComplete="off" value={weight} onChange={event => setWeight(event.target.value)} onFocus={event => event.target.select()} aria-invalid={!valid} aria-describedby={!valid ? 'portion-error' : 'portion-basis'} />
          <span>г</span>
        </div>
        <div className="portion-presets">{[...new Set([50, 100, 150, 200, Number(initialWeight || food.weight || 100)])].sort((a, b) => a - b).map(value => (
          <button type="button" key={value} aria-pressed={grams === value} onClick={() => setWeight(String(value))}>{value} г</button>
        ))}</div>
        {!valid && <p className="portion-error" id="portion-error">Вкажіть вагу від 1 до 5000 г.</p>}
        <div className="portion-total" aria-live="polite" aria-atomic="true"><span>У вашій порції</span><strong>{valid ? nutrition[0] : '-'} <small>ккал</small></strong></div>
        <div className="portion-macros">{['Білки', 'Жири', 'Вуглеводи'].map((label, index) => <div key={label}><strong>{valid ? nutrition[index + 1] : '-'} г</strong><span>{label}</span></div>)}</div>
        <p className="portion-basis" id="portion-basis">На 100 г: {Math.round((Number(food.calories) || 0) / baseWeight * 100)} ккал</p>
        {food.warning && <p className="portion-basis">{food.warning}</p>}
        {food.ingredients && <details className="portion-ingredients"><summary>Склад продукту</summary><p>{food.ingredients}</p></details>}
        <div className="portion-secondary-actions">
          {onFavorite && <button type="button" onClick={onFavorite} aria-pressed={favorite}><Star size={18} fill={favorite ? 'currentColor' : 'none'} />{favorite ? 'В обраному' : 'В обране'}</button>}
          {onEdit && <button type="button" onClick={onEdit}><Pencil size={18} /> Змінити продукт</button>}
        </div>
        <div className="portion-footer">
          <button type="submit" className="daily-add" disabled={!valid}><Check size={20} />{editing ? 'Зберегти зміни' : 'Додати й завершити'}</button>
          {!editing && <button type="button" className="portion-add-more" disabled={!valid} onClick={() => save(true)}><Plus size={18} /> Додати й обрати ще</button>}
        </div>
      </form>
    </dialog>
  );
}

