/**
 * Pinaúna Club — Correção administrativa de categoria/data de nascimento
 * Netlify Function: POST /api/evento-editar-inscrito
 *
 * O atleta preenche a própria ficha e pode errar a categoria (ou a idade que ela
 * depende). Essa função deixa o admin corrigir os dois campos depois — não mexe em
 * nada relacionado a pagamento (isso é o evento-marcar-pago.js / evento-status.js).
 *
 * Protegida por header x-admin-key (mesma ADMIN_API_KEY do painel de consentimentos).
 */

const { getStoreResiliente } = require("../../lib/blobs");
const { checarAdmin } = require("../../lib/asaas");
const { CATEGORIAS_VALIDAS } = require("../../lib/evento-constantes");

function store() {
  return getStoreResiliente("evento-4ed-inscricoes");
}

function dataNascimentoValida(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const d = new Date(str + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return false;
  const hoje = new Date();
  return d.getFullYear() > 1900 && d < hoje;
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": process.env.URL || "*",
    "Access-Control-Allow-Headers": "Content-Type, x-admin-key",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ erro: "Método não permitido" }) };
  }
  if (!checarAdmin(event)) {
    return { statusCode: 401, headers, body: JSON.stringify({ erro: "Não autorizado" }) };
  }

  try {
    const { cpf, categoria, data_nascimento } = JSON.parse(event.body || "{}");
    const cpfLimpo = (cpf || "").replace(/\D/g, "");
    if (!cpfLimpo) {
      return { statusCode: 400, headers, body: JSON.stringify({ erro: "CPF é obrigatório." }) };
    }
    if (categoria === undefined && data_nascimento === undefined) {
      return { statusCode: 400, headers, body: JSON.stringify({ erro: "Informe categoria e/ou data_nascimento pra alterar." }) };
    }
    if (categoria !== undefined && !CATEGORIAS_VALIDAS.includes(categoria)) {
      return { statusCode: 400, headers, body: JSON.stringify({ erro: "Categoria inválida." }) };
    }
    if (data_nascimento !== undefined && !dataNascimentoValida(data_nascimento)) {
      return { statusCode: 400, headers, body: JSON.stringify({ erro: "Data de nascimento inválida." }) };
    }

    const s = await store();
    const registro = await s.get(cpfLimpo, { type: "json" });
    if (!registro) {
      return { statusCode: 404, headers, body: JSON.stringify({ erro: "Inscrição não encontrada." }) };
    }

    const antes = { categoria: registro.categoria, data_nascimento: registro.data_nascimento };
    const atualizado = { ...registro };
    if (categoria !== undefined) atualizado.categoria = categoria;
    if (data_nascimento !== undefined) atualizado.data_nascimento = data_nascimento;

    // Trilha simples de auditoria — útil se depois alguém perguntar "quem mudou isso"
    const historico = Array.isArray(registro.historico_edicoes) ? registro.historico_edicoes.slice(-9) : [];
    historico.push({
      em: new Date().toISOString(),
      de: antes,
      para: { categoria: atualizado.categoria, data_nascimento: atualizado.data_nascimento },
    });
    atualizado.historico_edicoes = historico;

    await s.setJSON(cpfLimpo, atualizado);

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, inscrito: atualizado }) };
  } catch (err) {
    console.error("Erro evento-editar-inscrito:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ erro: err.message || "Erro interno" }) };
  }
};
