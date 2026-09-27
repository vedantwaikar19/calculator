import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { all, create } from 'mathjs';

const app = express();
const math = create(all, { number: 'number', precision: 14 });
const port = Number(process.env.PORT) || 3002;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
app.use(express.json({ limit: '12kb' }));

const degreeMode = (mode) => mode === 'DEG';
const safeExpression = (expression) => {
  const text = String(expression ?? '').trim();
  if (!text || text.length > 240) throw new Error('Enter a calculation under 240 characters.');
  if (!/^[\d\w\s.+\-*/%^(),!√πτ°]+$/.test(text)) throw new Error('This expression contains an unsupported character.');
  const normalized = text
    .replaceAll('π', 'pi')
    .replaceAll('τ', '(2*pi)')
    .replaceAll('×', '*')
    .replaceAll('÷', '/')
    .replaceAll('−', '-')
    .replaceAll('√(', 'sqrt(')
    .replace(/(\d+(?:\.\d+)?)°/g, '($1*pi/180)');
  const allowedNames = new Set(['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sqrt', 'cbrt', 'abs', 'log', 'log10', 'ln', 'exp', 'floor', 'ceil', 'round', 'pi', 'e', 'ans']);
  for (const name of normalized.match(/[A-Za-z_][A-Za-z_0-9]*/g) ?? []) {
    if (!allowedNames.has(name)) throw new Error(`“${name}” is not an available calculator function or constant.`);
  }
  return normalized;
};

function evaluate(expression, mode = 'DEG', previousAnswer = 0) {
  const normalized = safeExpression(expression);
  const parser = math.parser();
  const toRadians = degreeMode(mode) ? (x) => x * Math.PI / 180 : (x) => x;
  const fromRadians = degreeMode(mode) ? (x) => x * 180 / Math.PI : (x) => x;
  parser.set('sin', (x) => Math.sin(toRadians(x)));
  parser.set('cos', (x) => Math.cos(toRadians(x)));
  parser.set('tan', (x) => Math.tan(toRadians(x)));
  parser.set('asin', (x) => fromRadians(Math.asin(x)));
  parser.set('acos', (x) => fromRadians(Math.acos(x)));
  parser.set('atan', (x) => fromRadians(Math.atan(x)));
  parser.set('ans', Number.isFinite(Number(previousAnswer)) ? Number(previousAnswer) : 0);
  const value = parser.evaluate(normalized);
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('The result is not a finite real number.');
  return { value, expression: String(expression).trim(), mode };
}

app.get('/api/health', (_req, res) => res.json({ ok: true, aiEnabled: Boolean(process.env.OPENAI_API_KEY) }));

app.post('/api/calculate', (req, res) => {
  try {
    const result = evaluate(req.body?.expression, req.body?.mode, req.body?.previousAnswer);
    res.json({ ...result, exact: Number.isInteger(result.value), engineering: result.value === 0 ? '0' : result.value.toExponential(5) });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Could not evaluate that expression.' });
  }
});

app.post('/api/convert', (req, res) => {
  try {
    const amount = Number(req.body?.amount);
    const from = String(req.body?.from ?? '').trim();
    const to = String(req.body?.to ?? '').trim();
    if (!Number.isFinite(amount) || !/^[a-zA-Z]+$/.test(from) || !/^[a-zA-Z]+$/.test(to)) {
      return res.status(400).json({ error: 'Enter a number and valid unit symbols.' });
    }
    const converted = math.unit(amount, from).to(to);
    res.json({ amount, from, to, result: converted.toNumber(to), formatted: converted.format({ precision: 8 }) });
  } catch {
    res.status(400).json({ error: 'Those units cannot be converted. Check the unit symbols.' });
  }
});

const explainLocally = ({ expression, result, mode }) => {
  const operation = /\bsin\s*\(/i.test(expression) ? 'sine' : /\bcos\s*\(/i.test(expression) ? 'cosine' : /\btan\s*\(/i.test(expression) ? 'tangent' : /\bsqrt\s*\(/i.test(expression) ? 'square root' : /\^/.test(expression) ? 'exponentiation' : 'arithmetic';
  return `This is a ${operation} calculation. The expression was evaluated in ${mode === 'RAD' ? 'radian' : 'degree'} mode. The result is ${Number(result).toPrecision(8)}. For critical engineering work, verify the inputs, units, and rounding independently.`;
};

app.post('/api/assistant', async (req, res) => {
  const expression = String(req.body?.expression ?? '').slice(0, 240);
  const result = Number(req.body?.result);
  const mode = req.body?.mode === 'RAD' ? 'RAD' : 'DEG';
  if (!expression || !Number.isFinite(result)) return res.status(400).json({ error: 'Calculate a finite result before asking for an explanation.' });

  if (!process.env.OPENAI_API_KEY) {
    return res.json({ explanation: explainLocally({ expression, result, mode }), source: 'local', aiEnabled: false });
  }
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0.2,
        max_tokens: 180,
        messages: [
          { role: 'system', content: 'Explain the supplied engineering calculator expression and computed result in 2-4 concise sentences. State units only if they are explicitly present. Do not recalculate or claim the value is certified; remind users to independently verify safety-critical results.' },
          { role: 'user', content: JSON.stringify({ expression, result, angleMode: mode }) },
        ],
      }),
    });
    if (!response.ok) throw new Error(`AI provider responded with ${response.status}`);
    const payload = await response.json();
    res.json({ explanation: payload.choices?.[0]?.message?.content || explainLocally({ expression, result, mode }), source: 'openai', aiEnabled: true });
  } catch (error) {
    console.error('AI explanation failed:', error.message);
    res.status(502).json({ error: 'The AI helper is unavailable right now. Your calculator is still ready to use.' });
  }
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(root, 'dist')));
  app.get(/.*/, (_req, res) => res.sendFile(path.join(root, 'dist', 'index.html')));
}

app.listen(port, () => console.log(`Engineering calculator API listening on http://localhost:${port}`));
