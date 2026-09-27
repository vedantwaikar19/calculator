import { useEffect, useRef, useState } from 'react';

const KEYS = [
  ['sin', 'function'], ['cos', 'function'], ['tan', 'function'], ['(', 'function'], [')', 'function'], ['⌫', 'utility'],
  ['√', 'function'], ['x²', 'function'], ['xʸ', 'function'], ['7', 'number'], ['8', 'number'], ['9', 'number'],
  ['log', 'function'], ['ln', 'function'], ['π', 'constant'], ['4', 'number'], ['5', 'number'], ['6', 'number'],
  ['e', 'constant'], ['n!', 'function'], ['÷', 'operator'], ['1', 'number'], ['2', 'number'], ['3', 'number'],
  ['AC', 'utility'], ['±', 'utility'], ['×', 'operator'], ['0', 'number'], ['.', 'number'], ['=', 'equals'],
];
const CONSTANTS = [
  { symbol: 'g', value: '9.80665', name: 'Standard gravity', unit: 'm/s²' },
  { symbol: 'c', value: '299792458', name: 'Speed of light', unit: 'm/s' },
  { symbol: 'R', value: '8.31446', name: 'Gas constant', unit: 'J/(mol·K)' },
  { symbol: 'k', value: '1.380649e-23', name: 'Boltzmann constant', unit: 'J/K' },
];
const UNIT_PAIRS = [
  { label: 'Length', from: 'm', to: 'ft' },
  { label: 'Mass', from: 'kg', to: 'lb' },
  { label: 'Pressure', from: 'kPa', to: 'psi' },
  { label: 'Temperature', from: 'degC', to: 'degF' },
  { label: 'Energy', from: 'J', to: 'cal' },
];

function formatResult(value) {
  if (!Number.isFinite(value)) return 'Error';
  if (value !== 0 && (Math.abs(value) >= 1e10 || Math.abs(value) < 1e-7)) return value.toExponential(6).replace(/\.?(\d*?)0+e/, '$1e');
  return Number(value.toPrecision(10)).toLocaleString('en-US', { maximumFractionDigits: 10, useGrouping: false });
}

function App() {
  const [expression, setExpression] = useState('');
  const [result, setResult] = useState(null);
  const [previousAnswer, setPreviousAnswer] = useState(0);
  const [mode, setMode] = useState('DEG');
  const [activeTab, setActiveTab] = useState('calculator');
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [aiEnabled, setAiEnabled] = useState(false);
  const [explanation, setExplanation] = useState('Run a calculation and ask Vector to walk you through it.');
  const [explanationSource, setExplanationSource] = useState('');
  const [unitCategory, setUnitCategory] = useState(UNIT_PAIRS[0].label);
  const [unitAmount, setUnitAmount] = useState('1');
  const [unitResult, setUnitResult] = useState('');
  const [unitError, setUnitError] = useState('');
  const displayRef = useRef(null);

  useEffect(() => {
    fetch('/api/health').then((response) => response.json()).then((data) => setAiEnabled(data.aiEnabled)).catch(() => {});
  }, []);

  function append(value) {
    setError('');
    setResult(null);
    setExpression((current) => current + value);
  }

  function handleKey(label) {
    if (label === 'AC') {
      setExpression(''); setResult(null); setError(''); return;
    }
    if (label === '⌫') {
      setExpression((current) => current.slice(0, -1)); setResult(null); setError(''); return;
    }
    if (label === '=') { calculate(); return; }
    if (label === '±') { setExpression((current) => current ? `-(${current})` : '-'); return; }
    const mapped = { '×': '*', '÷': '/', '√': 'sqrt(', 'x²': '^2', 'xʸ': '^', 'π': 'π', 'n!': '!' }[label];
    append(mapped ?? (['sin', 'cos', 'tan', 'log', 'ln'].includes(label) ? `${label}(` : label));
  }

  async function calculate(submittedExpression = expression) {
    if (!submittedExpression.trim() || busy) return;
    setBusy(true); setError(''); setExplanationSource('');
    try {
      const response = await fetch('/api/calculate', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expression: submittedExpression, mode, previousAnswer }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not evaluate that expression.');
      setResult(data.value);
      setPreviousAnswer(data.value);
      setExpression(submittedExpression);
      setHistory((current) => [{ expression: submittedExpression, value: data.value, mode, at: Date.now() }, ...current].slice(0, 8));
    } catch (requestError) {
      setError(requestError.message || 'The calculator service is unavailable.'); setResult(null);
    } finally { setBusy(false); displayRef.current?.focus(); }
  }

  async function explainCalculation() {
    if (result === null) return;
    setExplanation('Working through the expression…'); setExplanationSource('');
    try {
      const response = await fetch('/api/assistant', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expression, result, mode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The assistant could not respond.');
      setExplanation(data.explanation); setExplanationSource(data.source);
    } catch (requestError) { setExplanation(requestError.message || 'The assistant could not respond.'); }
  }

  function keyboard(event) {
    if (event.key === 'Enter' || event.key === '=') { event.preventDefault(); calculate(); }
    else if (event.key === 'Escape') { setExpression(''); setResult(null); setError(''); }
    else if (event.key === 'Backspace' && document.activeElement !== displayRef.current) handleKey('⌫');
  }

  async function convertUnits(event) {
    event.preventDefault(); setUnitError(''); setUnitResult('');
    const pair = UNIT_PAIRS.find((unit) => unit.label === unitCategory);
    try {
      const response = await fetch('/api/convert', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount: Number(unitAmount), from: pair.from, to: pair.to }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not convert those units.');
      setUnitResult(`${Number(data.result.toPrecision(9))} ${data.to}`);
    } catch (requestError) { setUnitError(requestError.message); }
  }

  function useConstant(constant) {
    setActiveTab('calculator'); setExpression((current) => current + constant.value); setResult(null); setError('');
  }

  const activePair = UNIT_PAIRS.find((unit) => unit.label === unitCategory);

  return (
    <main className="app" onKeyDown={keyboard}>
      <header className="topbar">
        <a className="brand" href="#home"><span className="brand-symbol">V</span><span>vector<span className="brand-dot">.</span><small>ENGINEERING TOOLS</small></span></a>
        <div className="top-status"><span className="status-dot" /> CALCULATION ENGINE <span className="status-version">v1.0</span></div>
        <a className="top-help" href="#assistant">NEED A HAND? <span>↗</span></a>
      </header>

      <section className="page-intro" id="home">
        <div className="intro-copy"><p className="eyebrow">PRECISION, WITHOUT THE FUSS</p><h1>Think it through.<br /><em>Work it out.</em></h1><p className="intro-description">A dependable scientific calculator with an extra set of hands when you need them.</p></div>
        <div className="intro-meta"><span>BUILT FOR THE DETAILS</span><div className="meta-rule" /><span>01 — 03</span></div>
      </section>

      <nav className="mode-tabs" aria-label="Calculator tools">
        <button type="button" className={activeTab === 'calculator' ? 'selected' : ''} onClick={() => setActiveTab('calculator')}><span>⌗</span> Scientific</button>
        <button type="button" className={activeTab === 'units' ? 'selected' : ''} onClick={() => setActiveTab('units')}><span>↔</span> Unit converter</button>
        <button type="button" className={activeTab === 'constants' ? 'selected' : ''} onClick={() => setActiveTab('constants')}><span>π</span> Constants</button>
        <span className="angle-toggle"><span>ANGLE</span><button type="button" onClick={() => setMode(mode === 'DEG' ? 'RAD' : 'DEG')} aria-label={`Switch angle mode from ${mode}`}>{mode}</button></span>
      </nav>

      {activeTab === 'calculator' && (
        <section className="workspace">
          <div className="calculator-card">
            <div className="card-title"><div><span className="card-index">01</span><span>CALCULATOR</span></div><span className="key-hint">KEYBOARD READY &nbsp; ↵</span></div>
            <div className="display-panel">
              <div className="display-top"><span>EXPRESSION</span><span>{mode} MODE</span></div>
              <input ref={displayRef} className="expression-input" value={expression} onChange={(event) => { setExpression(event.target.value); setResult(null); setError(''); }} placeholder="Start with a value..." aria-label="Calculator expression" autoComplete="off" />
              <div className="display-result"><span>{error || (result !== null ? 'RESULT' : 'AWAITING INPUT')}</span><strong className={error ? 'result-error' : ''}>{error ? 'Check expression' : result !== null ? formatResult(result) : '—'}</strong></div>
            </div>
            <div className="keypad">{KEYS.map(([label, style]) => <button key={label} type="button" className={`key key-${style}`} onClick={() => handleKey(label)} aria-label={label === '⌫' ? 'Backspace' : label === 'AC' ? 'Clear all' : label}>{label === '⌫' ? '←' : label}</button>)}</div>
            <div className="calc-foot"><span><kbd>Enter</kbd> calculate</span><span><kbd>Esc</kbd> clear</span><span>Use <code>^</code> for powers</span></div>
          </div>

          <aside className="side-column">
            <section className="assistant-card" id="assistant">
              <div className="side-card-heading"><span className="assistant-icon">✳</span><div><p>YOUR CALCULATION SIDEKICK</p><h2>Vector assistant</h2></div></div>
              <div className={`ai-status${aiEnabled ? ' ai-connected' : ''}`}><span />{aiEnabled ? 'AI explanations enabled' : 'Local explanation mode'}<span className="info-mark" title="Add OPENAI_API_KEY to .env for AI-generated explanations.">i</span></div>
              <p className="assistant-text">{explanation}</p>
              <button type="button" className="explain-button" onClick={explainCalculation} disabled={result === null}>Explain this result <span>→</span></button>
              {!aiEnabled && <p className="assistant-note">Add a server-side OpenAI key to turn on AI. Calculator functions work without one.</p>}
              <p className="safety-note">For safety-critical work, verify results independently.</p>
            </section>

            <section className="history-card">
              <div className="side-card-heading history-heading"><div><p>RECENT WORK</p><h2>History</h2></div><button type="button" onClick={() => setHistory([])} disabled={!history.length}>CLEAR</button></div>
              {history.length ? <ul className="history-list">{history.slice(0, 4).map((item) => <li key={item.at}><button type="button" onClick={() => { setExpression(item.expression); setResult(item.value); setMode(item.mode); }}><span>{item.expression} <small>=</small></span><strong>{formatResult(item.value)}</strong></button></li>)}</ul> : <p className="empty-history">Your calculations will show up here.</p>}
            </section>
          </aside>
        </section>
      )}

      {activeTab === 'units' && (
        <section className="tool-card unit-card">
          <div className="card-title"><div><span className="card-index">02</span><span>UNIT CONVERTER</span></div><span className="key-hint">COMMON ENGINEERING UNITS</span></div>
          <div className="tool-content"><p className="eyebrow">KEEP YOUR UNITS IN CHECK</p><h2>One measurement,<br /><em>another way to see it.</em></h2>
            <form className="unit-form" onSubmit={convertUnits}>
              <label>MEASUREMENT TYPE<select value={unitCategory} onChange={(event) => { setUnitCategory(event.target.value); setUnitResult(''); }}><option>Length</option><option>Mass</option><option>Pressure</option><option>Temperature</option><option>Energy</option></select></label>
              <label>VALUE<input type="number" value={unitAmount} onChange={(event) => setUnitAmount(event.target.value)} step="any" required /></label>
              <div className="unit-arrow">→</div><div className="unit-route"><span>{activePair.from}</span><span className="route-line" /><span>{activePair.to}</span></div>
              <button className="convert-button" type="submit">Convert <span>→</span></button>
            </form>
            {unitError && <p className="unit-error" role="alert">{unitError}</p>}{unitResult && <div className="conversion-result" role="status"><span>CONVERTED VALUE</span><strong>{unitResult}</strong></div>}
            <p className="unit-disclaimer">Conversions are calculated by the server with standard unit definitions. Confirm the selected units before using results in a design.</p>
          </div>
        </section>
      )}

      {activeTab === 'constants' && (
        <section className="tool-card constants-card">
          <div className="card-title"><div><span className="card-index">03</span><span>REFERENCE CONSTANTS</span></div><span className="key-hint">SELECT ONE TO ADD TO YOUR EXPRESSION</span></div>
          <div className="constants-header"><p className="eyebrow">THE NUMBERS THAT KEEP SHOWING UP</p><h2>Useful constants.</h2><p>Tap a value to send it straight to the calculator.</p></div>
          <div className="constants-list">{CONSTANTS.map((constant) => <button type="button" key={constant.symbol} onClick={() => useConstant(constant)}><span className="constant-symbol">{constant.symbol}</span><span className="constant-description"><strong>{constant.name}</strong><small>{constant.unit}</small></span><code>{constant.value}</code><span className="constant-add">+</span></button>)}</div>
          <p className="unit-disclaimer">Standard values for reference. Check the precision and units required for your application.</p>
        </section>
      )}

      <footer className="footer"><span>VECTOR / ENGINEERING CALCULATOR</span><span>BUILT TO SHOW ITS WORK</span><span>DEG: {mode}</span></footer>
    </main>
  );
}

export default App;
