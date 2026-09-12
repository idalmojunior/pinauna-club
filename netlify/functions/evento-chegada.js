/**
 * Pinaúna Club — Controle de chegada ao vivo
 * Netlify Function: /api/evento-chegada
 *   GET  ?prova=2KM                       → lista chegadas registradas, em ordem
 *   POST { cpf, prova }                   → registra a chegada agora
 *   POST { cpf, prova, desfazer: true }   → remove o registro (toque errado)
 * Protegida por header x-admin-key
 */

const { getStoreResiliente } = require("../../lib/blobs");
const { checarAdmin } = require("../../lib/asaas");

function storeChegadas() {
  return getStoreResiliente("evento-4ed-chegadas");
}
function storeInscricoes() {
  return getStoreResiliente("evento-4ed-inscricoes");
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

  if (!checarAdmin(event)) {
    return { statusCode: 401, headers, body: JSON.stringify({ erro: "Não autorizado" }) };
  }

  const sc = await storeChegadas();

  try {
    if (event.httpMethod === "GET") {
      const prova = event.queryStringParameters?.prova;
      if (!prova) return { statusCode: 400, headers, body: JSON.stringify({ erro: "Informe a prova" }) };

      const { blobs } = await sc.list({ prefix: `${prova}__` });
      const registros = await Promise.all(blobs.map(async (b) => await sc.get(b.key, { type: "json" })));
      registros.sort((a, b) => new Date(a.chegada_em) - new Date(b.chegada_em));

      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, chegadas: registros }) };
    }

    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      const { cpf, prova, desfazer } = body;
      if (!cpf || !prova) {
        return { statusCode: 400, headers, body: JSON.stringify({ erro: "Informe cpf e prova" }) };
      }
      const cpfLimpo = cpf.replace(/\D/g, "");
      const chave = `${prova}__${cpfLimpo}`;

      if (desfazer) {
        await sc.delete(chave);
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, desfeito: true }) };
      }

      // Confirma que o atleta está inscrito nessa prova antes de registrar a chegada
      const inscrito = await (await storeInscricoes()).get(cpfLimpo, { type: "json" });
      if (!inscrito || inscrito.prova !== prova) {
        return { statusCode: 404, headers, body: JSON.stringify({ erro: "Atleta não inscrito nessa prova" }) };
      }

      const jaChegou = await sc.get(chave, { type: "json" });
      if (jaChegou) {
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, ja_registrado: true, chegada: jaChegou }) };
      }

      const registro = {
        cpf: cpfLimpo,
        nome: inscrito.nome,
        numero: inscrito.numero || null,
        categoria: inscrito.categoria,
        prova,
        chegada_em: new Date().toISOString(),
      };
      await sc.setJSON(chave, registro);

      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, chegada: registro }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ erro: "Método não permitido" }) };
  } catch (err) {
    console.error("Erro evento-chegada:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ erro: err.message || "Erro interno" }) };
  }
};
