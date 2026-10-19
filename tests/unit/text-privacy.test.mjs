// Testes unitários: normalização, tolerância a erros de digitação e proteção de dados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, levenshtein, phraseScore, tokens, truncate } from '../../js/lupi/shared/text.js';
import { redact, detectSensitive } from '../../js/lupi/shared/privacy.js';

test('[erros de digitação] normaliza acentos, maiúsculas e pontuação', () => {
  assert.equal(normalize('  Pró-Labore, É MEI? '), 'pro labore e mei');
});

test('[erros de digitação] levenshtein respeita o corte', () => {
  assert.equal(levenshtein('contador', 'contadr', 2), 1);
  assert.equal(levenshtein('empresa', 'empreza', 2), 1);
  assert.ok(levenshtein('mei', 'cnpj', 1) > 1);
});

test('[erros de digitação] frase com erro casa com peso menor; palavra curta não aceita erro', () => {
  assert.equal(phraseScore(tokens('quero abrir uma empresa'), 'abrir uma empresa'), 1);
  assert.equal(phraseScore(tokens('quero abrir uma empreza'), 'abrir uma empresa'), 0.8);
  assert.equal(phraseScore(tokens('sou mae'), 'sou mei'), 0, '"mei" tem 3 letras: sem tolerância');
});

test('truncate corta em palavra inteira', () => {
  assert.equal(truncate('uma frase bem comprida aqui', 15), 'uma frase bem…');
});

const SENSITIVE = [
  ['meu cpf é 123.456.789-09', 'cpf'],
  ['cpf 12345678909', 'cpf'],
  ['cnpj 12.345.678/0001-90', 'cnpj'],
  ['cartão 4111 1111 1111 1111', 'cartao'],
  ['me escreve em fulano@gmail.com', 'email'],
  ['meu zap (19) 98888-7777', 'telefone'],
  ['minha senha: abc123', 'senha'],
];
for (const [text, type] of SENSITIVE) {
  test(`[privacidade] detecta e remove ${type}: "${text}"`, () => {
    assert.ok(detectSensitive(text).includes(type));
    const r = redact(text);
    assert.match(r, /\[dado removido\]/);
    assert.ok(!detectSensitive(r).includes(type), `ainda contém ${type}: ${r}`);
  });
}

test('[privacidade] números comuns de negócio não são tratados como dado pessoal', () => {
  for (const t of ['faturo 5000 por mês', 'tenho 3 funcionários', 'abri a empresa em 2019', 'margem de 30%']) {
    assert.deepEqual(detectSensitive(t), [], t);
    assert.equal(redact(t), t);
  }
});
