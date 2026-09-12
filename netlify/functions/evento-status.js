/**
 * Pinaúna Club — Painel do evento: lista inscritos e sincroniza pagamento
 * Netlify Function: GET /api/evento-status
 *   ?sync=true    → confere no Asaas o status de cada inscrição ainda pendente e atualiza
 *   ?prova=2KM    → filtra por prova
 * Protegida por header x-admin-key (mesma ADMIN_API_KEY do painel de consentimentos)
 */

const { getStoreResiliente, proximoNumeroEvento } = require("../../lib/blobs");
const { asaasFetch, checarAdmin } = require("../../lib/asaas");

function store() {
  return getStoreResiliente("evento-4ed-inscricoes");
}

const STATUS_PAGOS = ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"];

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": process.env.URL || "*",
    "Content-Type": "application/json",
  };

  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers, body: JSON.stringify({ erro: "Método não permitido" }) };
  }

  if (!checarAdmin(event)) {
    return { statusCode: 401, headers, body: JSON.stringify({ erro: "Não autorizado" }) };
  }

  try {
    const qs = event.queryStringParameters || {};
    const s = await store();
    const { blobs } = await s.list();
    let inscritos = await Promise.all(blobs.map(async (b) => await s.get(b.key, { type: "json" })));

    if (qs.sync === "true") {
      // Sequencial (não Promise.all) de propósito: a numeração dos participantes usa um
      // contador compartilhado, e processar em paralelo poderia atribuir o mesmo número
      // pra duas pessoas que confirmassem o pagamento na mesma sincronização.
      const atualizados = [];
      for (const inscrito of inscritos) {
        let atual = inscrito;
        if (atual.status_pagamento !== "CONFIRMED") {
          try {
            const pagamento = await asaasFetch(`/payments/${atual.pagamento_id}`);
            const pago = STATUS_PAGOS.includes(pagamento.status);
            atual = {
              ...atual,
              status_pagamento: pago ? "CONFIRMED" : pagamento.status,
              status_checado_em: new Date().toISOString(),
            };
          } catch (err) {
            console.error(`Falha ao checar pagamento de ${atual.cpf}:`, err.message);
          }
        }
        // Atribui o número do participante assim que o pagamento estiver confirmado
        // (por sync com o Asaas ou por confirmação manual) — quem nunca paga não recebe número.
        if (atual.status_pagamento === "CONFIRMED" && !atual.numero) {
          atual = { ...atual, numero: await proximoNumeroEvento() };
        }
        if (atual !== inscrito) {
          await s.setJSON(inscrito.cpf, atual);
        }
        atualizados.push(atual);
      }
      inscritos = atualizados;
    }

    if (qs.prova) {
      inscritos = inscritos.filter((i) => i.prova === qs.prova);
    }

    inscritos.sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, total: inscritos.length, inscritos }) };
  } catch (err) {
    console.error("Erro evento-status:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ erro: err.message || "Erro interno" }) };
  }
};
