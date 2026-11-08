/**
 * Évaluateur d'expressions arithmétiques sans `eval` : nombres, + - * / % ^, parenthèses,
 * moins unaire. Rien d'autre n'est accepté, donc rien ne peut être exécuté.
 */
const MAX_LENGTH = 200;
const MAX_DEPTH = 40;

export class CalculatorError extends Error {}

export function evaluateExpression(source: string): number {
  const text = source.replace(/,/g, '.').replace(/×/g, '*').replace(/÷/g, '/').replace(/\s+/g, '');
  if (text === '' || text.length > MAX_LENGTH) {
    throw new CalculatorError('Expression vide ou trop longue.');
  }
  if (!/^[0-9+\-*/%^().]+$/.test(text)) {
    throw new CalculatorError('Seuls les nombres et les opérateurs + - * / % ^ ( ) sont acceptés.');
  }

  let position = 0;
  let depth = 0;

  const peek = () => text[position];

  function parseNumber(): number {
    const start = position;
    while (position < text.length && /[0-9.]/.test(text[position]!)) {
      position += 1;
    }
    const literal = text.slice(start, position);
    if (!/^(\d+\.?\d*|\.\d+)$/.test(literal)) {
      throw new CalculatorError(`Nombre invalide : « ${literal} ».`);
    }
    return Number(literal);
  }

  function parsePrimary(): number {
    if (peek() === '(') {
      depth += 1;
      if (depth > MAX_DEPTH) {
        throw new CalculatorError('Trop de parenthèses imbriquées.');
      }
      position += 1;
      const inner = parseSum();
      if (peek() !== ')') {
        throw new CalculatorError('Parenthèse fermante manquante.');
      }
      position += 1;
      depth -= 1;
      return inner;
    }
    return parseNumber();
  }

  function parseUnary(): number {
    if (peek() === '-') {
      position += 1;
      return -parseUnary();
    }
    if (peek() === '+') {
      position += 1;
      return parseUnary();
    }
    return parsePrimary();
  }

  function parsePower(): number {
    const base = parseUnary();
    if (peek() === '^') {
      position += 1;
      return base ** parsePower();
    }
    return base;
  }

  function parseProduct(): number {
    let value = parsePower();
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const operator = text[position++]!;
      const right = parsePower();
      if (operator === '*') {
        value *= right;
      } else if (right === 0) {
        throw new CalculatorError('Division par zéro.');
      } else {
        value = operator === '/' ? value / right : value % right;
      }
    }
    return value;
  }

  function parseSum(): number {
    let value = parseProduct();
    while (peek() === '+' || peek() === '-') {
      const operator = text[position++]!;
      const right = parseProduct();
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  }

  const result = parseSum();
  if (position !== text.length) {
    throw new CalculatorError('Expression incomplète ou invalide.');
  }
  if (!Number.isFinite(result)) {
    throw new CalculatorError('Le résultat est trop grand.');
  }
  return result;
}
