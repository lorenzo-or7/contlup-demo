/* Expressões da Lupi.
   Cada estado usa uma ilustração ORIGINAL da personagem (img/lupi/*.webp, recortadas da arte enviada).
   Para trocar por artes dedicadas (ex.: PNG transparente em img/lupi/estados/), basta mudar o caminho aqui. */

export const EXPRESSIONS = {
  idle: { src: 'img/lupi/confiante.webp', w: 356, h: 515 },
  welcome: { src: 'img/lupi/apresenta.webp', w: 447, h: 508 },
  thinking: { src: 'img/lupi/pensando.webp', w: 336, h: 488 },
  explaining: { src: 'img/lupi/ideia.webp', w: 410, h: 503 },
  success: { src: 'img/lupi/piscadinha.webp', w: 347, h: 491 },
};

export const STATES = Object.keys(EXPRESSIONS);

export function expressionFor(state) {
  return EXPRESSIONS[state] || EXPRESSIONS.idle;
}
