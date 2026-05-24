with open('src/App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

idx = content.find('handleWaterAdd(500)')
if idx == -1:
    print("Error: handleWaterAdd(500) not found!")
    exit(1)

# Find the closing tags of the water tracker actions div and water tracker card card
# The container ends with:
#               </div>
#             </div>
# Let's search for "</div>" twice after idx.

idx_div1 = content.find('</div>', idx)
if idx_div1 == -1:
    print("Error: first closing div not found!")
    exit(1)

idx_div2 = content.find('</div>', idx_div1 + 6)
if idx_div2 == -1:
    print("Error: second closing div not found!")
    exit(1)

insert_pos = idx_div2 + 6

# Check line endings to keep it consistent
has_crlf = '\r\n' in content[insert_pos:insert_pos+20]
newline = '\r\n' if has_crlf else '\n'

replacement_card = newline + newline + """            {/* Weight Tracker Card */}
            <div className="glass-card weight-tracker-card" style={{ marginTop: '16px' }}>
              <div className="weight-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div>
                  <h3 className="weight-title" style={{ fontSize: '15px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                    ⚖️ Вага та прогрес
                  </h3>
                  {(() => {
                    const currentWeight = weightHistory[weightHistory.length - 1]?.weight || profile.weight;
                    const targetWeight = profile.targetWeight || 65;
                    const diff = (currentWeight - targetWeight).toFixed(1);
                    return (
                      <p className="weight-progress" style={{ fontSize: '12px', opacity: 0.7, marginTop: '2px', margin: 0 }}>
                        Поточна: <strong>{currentWeight} кг</strong> • Ціль: <strong>{targetWeight} кг</strong> (
                        {diff > 0 ? `ще ${diff} кг до цілі` : diff < 0 ? `набрати ${Math.abs(diff)} кг` : 'ціль досягнута!'}
                        )
                      </p>
                    );
                  })()}
                </div>
                <button 
                  className="btn-water-add" 
                  onClick={() => {
                    const currentWeight = weightHistory[weightHistory.length - 1]?.weight || profile.weight;
                    setWeightInputVal(currentWeight.toString());
                    setIsWeightModalOpen(true);
                  }}
                  title="Записати вагу"
                  style={{ width: 'auto', padding: '6px 12px', borderRadius: '10px', fontSize: '12px', background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255,255,255,0.1)', height: 'auto' }}
                >
                  Записати
                </button>
              </div>

              {/* SVG Line Chart */}
              {(() => {
                const chartData = getWeightChartData();
                if (!chartData) {
                  return (
                    <div style={{ textAlign: 'center', padding: '20px', fontSize: '12px', opacity: 0.5 }}>
                      Додайте записи ваги, щоб побачити графік
                    </div>
                  );
                }
                const { points, linePath, areaPath, width, height } = chartData;
                return (
                  <div className="weight-chart-container" style={{ position: 'relative', overflow: 'visible', margin: '10px 0 5px' }}>
                    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} style={{ overflow: 'visible' }}>
                      <defs>
                        <linearGradient id="weightChartGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="rgba(16, 185, 129, 0.25)" />
                          <stop offset="100%" stopColor="rgba(16, 185, 129, 0.0)" />
                        </linearGradient>
                      </defs>
                      
                      {/* Grid Lines */}
                      <line x1="25" y1="15" x2="275" y2="15" stroke="rgba(255,255,255,0.05)" strokeDasharray="3" />
                      <line x1="25" y1="50" x2="275" y2="50" stroke="rgba(255,255,255,0.05)" strokeDasharray="3" />
                      <line x1="25" y1="85" x2="275" y2="85" stroke="rgba(255,255,255,0.05)" strokeDasharray="3" />

                      {/* Area under line */}
                      <path d={areaPath} fill="url(#weightChartGrad)" />

                      {/* Bezier Line */}
                      <path 
                        d={linePath} 
                        fill="none" 
                        stroke="#10b981" 
                        strokeWidth="2.5" 
                        strokeLinecap="round" 
                      />

                      {/* Dots and Labels */}
                      {points.map((p, idx) => (
                        <g key={idx}>
                          {/* Outer glow ring */}
                          <circle cx={p.x} cy={p.y} r="5" fill="rgba(16, 185, 129, 0.2)" />
                          {/* Inner circle */}
                          <circle cx={p.x} cy={p.y} r="3" fill="#10b981" />
                          
                          {/* Weight label above dot */}
                          <text 
                            x={p.x} 
                            y={p.y - 8} 
                            textAnchor="middle" 
                            fontSize="8.5" 
                            fontWeight="700" 
                            fill="rgba(255,255,255,0.85)"
                          >
                            {p.weight}
                          </text>

                          {/* Date label below chart */}
                          <text 
                            x={p.x} 
                            y={height - 2} 
                            textAnchor="middle" 
                            fontSize="7.5" 
                            fill="rgba(255,255,255,0.4)"
                          >
                            {p.label}
                          </text>
                        </g>
                      ))}
                    </svg>
                  </div>
                );
              })()}
            </div>"""

if has_crlf:
    replacement_card = replacement_card.replace('\n', '\r\n')

new_content = content[:insert_pos] + replacement_card + content[insert_pos:]

with open('src/App.jsx', 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Success: Weight Tracker Card applied successfully!")
