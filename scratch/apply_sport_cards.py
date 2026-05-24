with open('src/App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Let's define the sport card template
sport_card_jsx = """
                const sportCard = (
                  <div key="SportActivities" className="meal-category-card sport-category-card" style={{ borderLeft: '3px solid #10b981', marginTop: '16px' }}>
                    <div className="category-header">
                      <div className="category-title">
                        <span>🏃</span>
                        <span style={{ fontWeight: 700 }}>Активності та Спорт</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {totalBurnedCalories > 0 && <span className="category-total-cals" style={{ color: '#10b981', fontWeight: 600 }}>-{totalBurnedCalories} ккал</span>}
                        <button 
                          className="category-add-btn" 
                          onClick={() => {
                            setIsExerciseModalOpen(true);
                          }}
                          title="Додати активність"
                          style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: 'none', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>
                    
                    {currentDayExercises.length === 0 ? (
                      <div className="category-empty-placeholder" style={{ padding: '16px', textAlign: 'center', fontSize: '13px', color: '#94a3b8' }}>
                        <span>Немає занять за сьогодні. </span>
                        <span 
                          className="category-quick-add-link"
                          onClick={() => {
                            setIsExerciseModalOpen(true);
                          }}
                          style={{ color: '#10b981', cursor: 'pointer', textDecoration: 'underline', marginLeft: '4px' }}
                        >
                          Додати активність
                        </span>
                      </div>
                    ) : (
                      <div className="category-meals-list" style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                        {currentDayExercises.map(ex => (
                          <div key={ex.id} className="timeline-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '12px', borderLeft: '3px solid #10b981' }}>
                            <div className="meal-info" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={{ fontSize: '20px' }}>⚡</span>
                              <div className="meal-text" style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                                <span className="meal-name" style={{ fontSize: '14px', fontWeight: 600 }}>{ex.name}</span>
                                <span className="meal-meta" style={{ fontSize: '11px', color: '#94a3b8' }}>
                                  {ex.duration} хв • спалено {ex.burnedCalories} ккал
                                </span>
                              </div>
                            </div>
                            <button 
                              className="meal-delete-btn" 
                              onClick={() => {
                                setExerciseLogs(prev => prev.filter(item => item.id !== ex.id));
                                showToast(`Активність "${ex.name}" видалено`, 'info');
                              }} 
                              title="Видалити"
                              style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '6px' }}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
"""

# Find occurrences of return categories.map(cat => {
# Let's do replacements.

# Occurrence 1: Dashboard Categories Map
# We can find `return categories.map(cat => {` and search for its ending `});\n              })()}` which is Dashboard timeline end.
idx1 = content.find('return categories.map(cat => {')
if idx1 == -1:
    print("Error: First categories.map not found!")
    exit(1)

# Find the matching `});` after idx1
idx1_end = content.find('});\n              })()}', idx1)
if idx1_end == -1:
    idx1_end = content.find('});\r\n              })()}', idx1)
    
if idx1_end == -1:
    print("Error: First categories.map closing tag not found!")
    exit(1)

newline = '\r\n' if '\r\n' in content else '\n'

# Replace Occurrence 1
first_part = content[:idx1] + "const renderedCats = categories.map(cat => {"
middle_part = content[idx1 + len("return categories.map(cat => {"):idx1_end] + "});" + newline + sport_card_jsx + newline + "                return [...renderedCats, sportCard];"
last_part = content[idx1_end + 3:]

content_updated = first_part + middle_part + last_part

# Occurrence 2: Diary Categories Map (now search in updated content)
# It should be after our first insertion.
idx2 = content_updated.find('return categories.map(cat => {', idx1_end + 500)
if idx2 == -1:
    print("Error: Second categories.map not found!")
    exit(1)

idx2_end = content_updated.find('});\n              })()}', idx2)
if idx2_end == -1:
    idx2_end = content_updated.find('});\r\n              })()}', idx2)

if idx2_end == -1:
    print("Error: Second categories.map closing tag not found!")
    exit(1)

first_part_2 = content_updated[:idx2] + "const renderedCats = categories.map(cat => {"
middle_part_2 = content_updated[idx2 + len("return categories.map(cat => {"):idx2_end] + "});" + newline + sport_card_jsx + newline + "                return [...renderedCats, sportCard];"
last_part_2 = content_updated[idx2_end + 3:]

content_final = first_part_2 + middle_part_2 + last_part_2

# Normalize LFs/CRLFs in the new insertions
if '\r\n' in content:
    content_final = content_final.replace('\r\n', '\n').replace('\n', '\r\n')

with open('src/App.jsx', 'w', encoding='utf-8') as f:
    f.write(content_final)

print("Success: Sport cards timeline mapped successfully in Dashboard and Diary views!")
