import { inr } from '../api'
import { computeFire } from '../fire'

const inputStyle = {
  padding: '5px 8px', border: '1px solid var(--line)', fontFamily: 'var(--mono)',
  fontSize: 12, width: 130, borderRadius: 3, background: 'var(--card)',
}
const labelStyle = { fontSize: 11, color: 'var(--ink-soft)', display: 'block', marginBottom: 4 }

function Field({ label, value, onChange, prefix, step = 1000 }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {prefix && <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink-soft)' }}>{prefix}</span>}
        <input type="number" min="0" step={step} value={value}
          onChange={e => onChange(Number(e.target.value) || 0)}
          style={inputStyle} />
      </div>
    </div>
  )
}

export default function FireTracker({ currentValue, fireInputs, onFireInputs }) {
  const { annualExpenses, swr, expectedReturn, annualContribution, yearsToRetirement } = fireInputs

  const set = (key) => (v) => onFireInputs({ [key]: v })
  const setPct = (key) => (v) => onFireInputs({ [key]: v / 100 })

  const fire = computeFire({
    currentValue: currentValue || 0,
    annualExpenses, swr, expectedReturn, annualContribution, yearsToRetirement,
  })

  return (
    <div className="harvest-page">
      <h2>FIRE</h2>
      <div className="harvest-fy">Financial Independence, Retire Early</div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, margin: '16px 0' }}>
        <Field label="Annual expenses" prefix="₹" value={annualExpenses} onChange={set('annualExpenses')} />
        <Field label="Safe withdrawal rate" prefix="%" step={0.25} value={Math.round(swr * 10000) / 100} onChange={setPct('swr')} />
        <Field label="Expected annual return" prefix="%" step={0.5} value={Math.round(expectedReturn * 10000) / 100} onChange={setPct('expectedReturn')} />
        <Field label="Annual contribution" prefix="₹" value={annualContribution} onChange={set('annualContribution')} />
        <Field label="Years to retirement" value={yearsToRetirement} step={1} onChange={set('yearsToRetirement')} />
      </div>

      {!annualExpenses ? (
        <div className="empty">
          <h2>Enter your annual expenses</h2>
          <p>Your FIRE number and progress will show up once you do.</p>
        </div>
      ) : (
        <>
          <div className="harvest-cards">
            <div className="metric">
              <div className="metric-label">FIRE number</div>
              <div className="metric-value">₹{inr(fire.fireNumber)}</div>
              <div className="metric-sub">{annualExpenses ? `expenses ÷ ${(swr * 100).toFixed(2)}% SWR` : ''}</div>
            </div>
            <div className="metric">
              <div className="metric-label">Progress</div>
              <div className={`metric-value ${fire.progressPct >= 100 ? 'up' : ''}`}>
                {fire.progressPct == null ? '—' : `${fire.progressPct.toFixed(1)}%`}
              </div>
              <div className="metric-sub">of FIRE number</div>
            </div>
            <div className="metric">
              <div className="metric-label">Years to FI</div>
              <div className="metric-value up">
                {fire.progressPct >= 100 ? "You're FI" : fire.yearsToFire == null ? '100+' : fire.yearsToFire}
              </div>
              <div className="metric-sub">at this savings + return rate</div>
            </div>
            <div className="metric">
              <div className="metric-label">Withdrawable today</div>
              <div className="metric-value">₹{inr(fire.withdrawableToday)}</div>
              <div className="metric-sub">per year, if retiring now</div>
            </div>
          </div>

          <h2 style={{ marginTop: 24 }}>Coast FIRE</h2>
          <div className="harvest-fy">
            The corpus needed today to hit your FIRE number by then, with zero further contributions.
          </div>
          <div className="harvest-cards" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            <div className="metric">
              <div className="metric-label">Coast FIRE number (today)</div>
              <div className="metric-value">₹{inr(fire.coastFireNumber)}</div>
              <div className="metric-sub">in {yearsToRetirement} years, compounding only</div>
            </div>
            <div className="metric">
              <div className="metric-label">Coast FIRE progress</div>
              <div className={`metric-value ${fire.coastProgressPct >= 100 ? 'up' : ''}`}>
                {fire.coastProgressPct == null ? '—' : `${fire.coastProgressPct.toFixed(1)}%`}
              </div>
              <div className="metric-sub">
                {fire.coastProgressPct >= 100
                  ? "You've already Coast-FIRE'd"
                  : `₹${inr(Math.max(0, fire.coastFireNumber - (currentValue || 0)))} more needed`}
              </div>
            </div>
          </div>
        </>
      )}

      <p className="note" style={{ marginTop: 20, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
        Educational estimates only. Assumes a constant expected return and doesn't model inflation,
        sequence-of-returns risk, or taxes on withdrawal — not financial advice.
      </p>
    </div>
  )
}
