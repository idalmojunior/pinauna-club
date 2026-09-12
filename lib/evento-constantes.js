/**
 * Pinaúna Club — Constantes compartilhadas do evento "4ª Edição — Troféu Ana Serra"
 * Centralizado aqui pra evitar duas listas de categorias divergindo entre
 * evento-inscricao.js e evento-editar-inscrito.js.
 */

const EVENTO_ID = "pinauna-4ed-2026";
const EVENTO_NOME = "Pinaúna Club — 4ª Edição (Troféu Ana Serra)";
const VALOR_INSCRICAO = 150;
const PRAZO_PAGAMENTO_DIAS = 3;

const PROVAS_VALIDAS = ["2KM", "500M", "200M", "AQUATHLON"];

const CATEGORIAS_VALIDAS = [
  "LOMANTO",
  "MIRIM (9-10)",
  "PETIZ (11-12)",
  "INFANTIL (13-14)",
  "JUVENIL (15-16)",
  "JUNIOR (17-19)",
  "SENIOR (20-24)",
  "MASTER A (25-29)",
  "MASTER B (30-34)",
  "MASTER C (35-39)",
  "MASTER D (40-44)",
  "MASTER E (45-49)",
  "MASTER F (50-54)",
  "MASTER G (55-59)",
  "MASTER H (60-64)",
  "MASTER I (65-69)",
  "PCD",
];

const TAMANHOS_VALIDOS = ["P", "M", "G", "GG"];

const TERMO_VERSAO_EVENTO = "pinauna-evento-4ed-termo-v1-2026-09-11";

module.exports = {
  EVENTO_ID,
  EVENTO_NOME,
  VALOR_INSCRICAO,
  PRAZO_PAGAMENTO_DIAS,
  PROVAS_VALIDAS,
  CATEGORIAS_VALIDAS,
  TAMANHOS_VALIDOS,
  TERMO_VERSAO_EVENTO,
};
