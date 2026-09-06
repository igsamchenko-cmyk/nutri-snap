import { Plus } from 'lucide-react';

export default function DailySummary({ totals, profile, onAdd }) {
  const remaining = Math.round(profile.targetCalories - totals.calories);
  const progress = Math.min(100, Math.max(0, totals.calories / profile.targetCalories * 100)) || 0;
  return (
    <section className="daily-summary" aria-label="Підсумок дня">
      <div className="daily-summary-top">
        <div className="daily-ring" style={{ '--progress': `${progress}%` }} aria-hidden="true">
          <span>{Math.round(progress)}<small>%</small></span>
        </div>
        <div className="daily-remaining">
          <span>{remaining < 0 ? 'Понад ціль' : 'Залишилось на день'}</span>
          <strong>{Math.abs(remaining).toLocaleString('uk-UA')} <small>ккал</small></strong>
        </div>
      </div>
      <div className="daily-energy">
        <span>Спожито <strong>{totals.calories.toLocaleString('uk-UA')} ккал</strong></span>
        <span>Ціль <strong>{Number(profile.targetCalories).toLocaleString('uk-UA')} ккал</strong></span>
      </div>
      <div className="daily-macros">
        {[
          ['protein', 'Білки', 'targetProtein'],
          ['fat', 'Жири', 'targetFat'],
          ['carbs', 'Вуглеводи', 'targetCarbs'],
        ].map(([key, label, target]) => (
          <div key={key} style={{ '--macro-color': `var(--color-${key})` }}>
            <span>{label}</span>
            <strong>{totals[key]} <small>/ {profile[target]} г</small></strong>
            <progress aria-label={label} value={totals[key]} max={profile[target] || 1} />
          </div>
        ))}
      </div>
      <button type="button" className="daily-add" onClick={onAdd}><Plus size={20} /> Додати їжу</button>
    </section>
  );
}

