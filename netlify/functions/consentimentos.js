/**
 * Pinaúna Club — Consulta de Comprovantes de Aceite do Termo
 * Netlify Function: GET /api/consentimentos?cpf=00000000000
 *
 * Uso interno (Idalmo/Pinaúna) para recuperar a prova de aceite do termo de
 * responsabilidade + declaração de saúde em caso de necessidade (ex.: um
 * incidente com um aluno). Protegido por uma chave simples via header.
 *
 * Configure a variável de ambiente ADMIN_API_KEY no Netlify (Site settings →
 * Environment variables) com um valor forte e secreto — é diferente da
 * ASAAS_API_KEY. Para consultar, envie o header:
 *   x-admin-key: <valor da ADMIN_API_KEY>
 */

const { getStore } = require("@netlify/blobs");

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": process.env.URL || "*",
    "Content-Type": "application/json",
  };

  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers, body: JSON.stringify({ erro: "Método não permitido" }) };
  }

  const chaveEnviada = event.headers?.["x-admin-key"];
  if (!process.env.ADMIN_API_KEY || chaveEnviada !== process.env.ADMIN_API_KEY) {
    return { statusCode: 401, headers, body: JSON.stringify({ erro: "Não autorizado" }) };
  }

  try {
    const cpfBruto = event.queryStringParameters?.cpf || "";
    const cpf = cpfBruto.replace(/\D/g, "");
    const store = getStore("consentimentos-pinauna");

    const { blobs } = await store.list(cpf ? { prefix: `${cpf}__` } : {});
    const registros = await Promise.all(
      blobs.map(async (b) => await store.get(b.key, { type: "json" }))
    );

    // Mais recentes primeiro
    registros.sort((a, b) => new Date(b.termo_registrado_em) - new Date(a.termo_registrado_em));

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, total: registros.length, registros }) };
  } catch (err) {
    console.error("Erro ao consultar consentimentos:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ erro: err.message || "Erro interno" }) };
  }
};
