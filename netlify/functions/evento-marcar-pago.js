/**
 * Pinaúna Club — Confirmação manual de pagamento recebido fora do Asaas
 * Netlify Function: POST /api/evento-marcar-pago
 *
 * Para quando o atleta paga direto (dinheiro/Pix na mão do professor, por exemplo) em vez
 * de usar o link de cobrança. Usa o endpoint oficial do Asaas pra "confirmar recebimento em
 * dinheiro" (POST /payments/{id}/receiveInCash) — isso marca a cobrança como paga
 * (status RECEIVED_IN_CASH) sem gerar movimentação financeira real na conta, e evita que a
 * régua de cobrança do Asaas continue chamando quem já pagou por fora.
 *
 * Protegida por header x-admin-key (mesma ADMIN_API_KEY do painel de consentimentos).
 */

const { getStoreResiliente, proximoNumeroEvento } = require("../../lib/blobs");
const { asaasFetch, checarAdmin } = require("../../lib/asaas");

function store() {
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
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ erro: "Método não permitido" }) };
  }
  if (!checarAdmin(event)) {
    return { statusCode: 401, headers, body: JSON.stringify({ erro: "Não autorizado" }) };
  }

  try {
    const { cpf } = JSON.parse(event.body || "{}");
    const cpfLimpo = (cpf || "").replace(/\D/g, "");
    if (!cpfLimpo) {
      return { statusCode: 400, headers, body: JSON.stringify({ erro: "CPF é obrigatório." }) };
    }

    const s = await store();
    const registro = await s.get(cpfLimpo, { type: "json" });
    if (!registro) {
      return { statusCode: 404, headers, body: JSON.stringify({ erro: "Inscrição não encontrada." }) };
    }

    if (registro.status_pagamento === "CONFIRMED") {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, ja_confirmado: true, mensagem: "Esse pagamento já estava confirmado.", inscrito: registro }),
      };
    }

    // Confirma no Asaas — sem notificar o cliente (é uma correção administrativa,
    // não uma cobrança de verdade) e sem valor/data específicos (usa os padrões do Asaas).
    await asaasFetch(`/payments/${registro.pagamento_id}/receiveInCash`, "POST", {
      notifyCustomer: false,
    });

    const atualizado = {
      ...registro,
      status_pagamento: "CONFIRMED",
      pago_manualmente: true,
      status_checado_em: new Date().toISOString(),
    };
    if (!atualizado.numero) {
      atualizado.numero = await proximoNumeroEvento();
    }
    await s.setJSON(cpfLimpo, atualizado);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, mensagem: "Pagamento confirmado manualmente.", inscrito: atualizado }),
    };
  } catch (err) {
    console.error("Erro evento-marcar-pago:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ erro: err.message || "Erro interno" }) };
  }
};
