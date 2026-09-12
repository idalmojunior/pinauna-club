/**
 * Pinaúna Club — Ranking ao vivo do evento (pública, sem autenticação)
 * Netlify Function: GET /api/evento-ranking?prova=2KM
 * Calcula a colocação geral e por categoria a partir da ordem real de chegada.
 */

const { getStoreResiliente } = require("../../lib/blobs");

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": process.env.URL || "*",
    "Content-Type": "application/json",
  };

  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers, body: JSON.stringify({ erro: "Método não permitido" }) };
  }

  const prova = event.queryStringParameters?.prova;
  if (!prova) {
    return { statusCode: 400, headers, body: JSON.stringify({ erro: "Informe a prova" }) };
  }

  try {
    const store = await getStoreResiliente("evento-4ed-chegadas");
    const { blobs } = await store.list({ prefix: `${prova}__` });
    const chegadas = await Promise.all(blobs.map(async (b) => await store.get(b.key, { type: "json" })));
    chegadas.sort((a, b) => new Date(a.chegada_em) - new Date(b.chegada_em));

    const geral = chegadas.map((c, i) => ({ ...c, posicao_geral: i + 1 }));

    const porCategoria = {};
    for (const c of geral) {
      if (!porCategoria[c.categoria]) porCategoria[c.categoria] = [];
      porCategoria[c.categoria].push(c);
    }
    for (const cat of Object.keys(porCategoria)) {
      porCategoria[cat] = porCategoria[cat].map((c, i) => ({
        posicao_categoria: i + 1,
        posicao_geral: c.posicao_geral,
        nome: c.nome,
        numero: c.numero || null,
        chegada_em: c.chegada_em,
      }));
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, prova, total: geral.length, categorias: porCategoria }),
    };
  } catch (err) {
    console.error("Erro evento-ranking:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ erro: err.message || "Erro interno" }) };
  }
};
