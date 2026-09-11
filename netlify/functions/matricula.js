/**
 * Pinaúna Club — Função de Matrícula
 * Netlify Function: POST /api/matricula
 *
 * Fluxo:
 * 1. Recebe dados do aluno + plano escolhido + aceite do termo de responsabilidade
 * 2. Valida que o termo foi aceito
 * 3. Cria (ou busca) cliente no Asaas
 * 4. Cria assinatura recorrente com o ciclo correto
 * 5. Se tiver código de indicação válido, aplica desconto de 1 mês no indicador
 * 6. Registra o aceite do termo (Netlify Blobs + observação no cliente Asaas)
 * 7. Retorna link de pagamento para o aluno
 */

const { getStore } = require("@netlify/blobs");

const ASAAS_BASE = "https://sandbox.asaas.com/api/v3"; // Troque para https://api.asaas.com/api/v3 em produção

// Mapeamento de planos: id → { nome, valor_mensal, ciclo, meses, desconto_pct }
const PLANOS = {
  // ── Mensal ────────────────────────────────────────────────
  mensal_quarta:         { nome: "Quarta — Mensal",        valor: 75,  ciclo: "MONTHLY",   meses: 1,  desconto: 0  },
  mensal_sabado:         { nome: "Sábado — Mensal",        valor: 75,  ciclo: "MONTHLY",   meses: 1,  desconto: 0  },
  mensal_domingo:        { nome: "Domingo — Mensal",       valor: 100, ciclo: "MONTHLY",   meses: 1,  desconto: 0  },
  mensal_qua_sab:        { nome: "Qua+Sáb — Mensal",      valor: 135, ciclo: "MONTHLY",   meses: 1,  desconto: 0  },
  mensal_qua_dom:        { nome: "Qua+Dom — Mensal",       valor: 150, ciclo: "MONTHLY",   meses: 1,  desconto: 0  },
  mensal_sab_dom:        { nome: "Sáb+Dom — Mensal",       valor: 150, ciclo: "MONTHLY",   meses: 1,  desconto: 0  },
  mensal_completo:       { nome: "Completo — Mensal",      valor: 200, ciclo: "MONTHLY",   meses: 1,  desconto: 0  },

  // ── Trimestral (5% de desconto) ───────────────────────────
  tri_quarta:            { nome: "Quarta — Trimestral",   valor: 214, ciclo: "QUARTERLY",  meses: 3,  desconto: 5  },
  tri_sabado:            { nome: "Sábado — Trimestral",   valor: 214, ciclo: "QUARTERLY",  meses: 3,  desconto: 5  },
  tri_domingo:           { nome: "Domingo — Trimestral",  valor: 285, ciclo: "QUARTERLY",  meses: 3,  desconto: 5  },
  tri_qua_sab:           { nome: "Qua+Sáb — Trimestral", valor: 385, ciclo: "QUARTERLY",  meses: 3,  desconto: 5  },
  tri_qua_dom:           { nome: "Qua+Dom — Trimestral",  valor: 428, ciclo: "QUARTERLY",  meses: 3,  desconto: 5  },
  tri_sab_dom:           { nome: "Sáb+Dom — Trimestral",  valor: 428, ciclo: "QUARTERLY",  meses: 3,  desconto: 5  },
  tri_completo:          { nome: "Completo — Trimestral", valor: 570, ciclo: "QUARTERLY",  meses: 3,  desconto: 5  },

  // ── Semestral (10% de desconto) ───────────────────────────
  sem_quarta:            { nome: "Quarta — Semestral",    valor: 405, ciclo: "SEMIANNUALLY", meses: 6, desconto: 10 },
  sem_sabado:            { nome: "Sábado — Semestral",    valor: 405, ciclo: "SEMIANNUALLY", meses: 6, desconto: 10 },
  sem_domingo:           { nome: "Domingo — Semestral",   valor: 540, ciclo: "SEMIANNUALLY", meses: 6, desconto: 10 },
  sem_qua_sab:           { nome: "Qua+Sáb — Semestral",  valor: 729, ciclo: "SEMIANNUALLY", meses: 6, desconto: 10 },
  sem_qua_dom:           { nome: "Qua+Dom — Semestral",   valor: 810, ciclo: "SEMIANNUALLY", meses: 6, desconto: 10 },
  sem_sab_dom:           { nome: "Sáb+Dom — Semestral",   valor: 810, ciclo: "SEMIANNUALLY", meses: 6, desconto: 10 },
  sem_completo:          { nome: "Completo — Semestral",  valor: 1080, ciclo: "SEMIANNUALLY", meses: 6, desconto: 10 },

  // ── Anual (15% de desconto) ───────────────────────────────
  anual_quarta:          { nome: "Quarta — Anual",        valor: 765, ciclo: "YEARLY",     meses: 12, desconto: 15 },
  anual_sabado:          { nome: "Sábado — Anual",        valor: 765, ciclo: "YEARLY",     meses: 12, desconto: 15 },
  anual_domingo:         { nome: "Domingo — Anual",       valor: 1020, ciclo: "YEARLY",    meses: 12, desconto: 15 },
  anual_qua_sab:         { nome: "Qua+Sáb — Anual",      valor: 1377, ciclo: "YEARLY",    meses: 12, desconto: 15 },
  anual_qua_dom:         { nome: "Qua+Dom — Anual",       valor: 1530, ciclo: "YEARLY",    meses: 12, desconto: 15 },
  anual_sab_dom:         { nome: "Sáb+Dom — Anual",       valor: 1530, ciclo: "YEARLY",    meses: 12, desconto: 15 },
  anual_completo:        { nome: "Completo — Anual",      valor: 2040, ciclo: "YEARLY",    meses: 12, desconto: 15 },
};

// ── Helpers ────────────────────────────────────────────────────────────────

function asaasHeaders() {
  return {
    "Content-Type": "application/json",
    "access_token": process.env.ASAAS_API_KEY,
    "User-Agent": "PinaunaClub/1.0",
  };
}

async function asaasFetch(path, method = "GET", body = null) {
  const opts = { method, headers: asaasHeaders() };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${ASAAS_BASE}${path}`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.errors?.[0]?.description || `Asaas error ${res.status}`);
  return data;
}

/** Busca cliente pelo CPF; cria se não existir */
async function upsertCliente({ nome, email, cpfCnpj, fone }) {
  // tenta buscar pelo CPF
  const cpfLimpo = cpfCnpj.replace(/\D/g, "");
  const busca = await asaasFetch(`/customers?cpfCnpj=${cpfLimpo}`);
  if (busca.data?.length > 0) return busca.data[0];

  return asaasFetch("/customers", "POST", {
    name: nome,
    email,
    cpfCnpj: cpfLimpo,
    mobilePhone: fone.replace(/\D/g, ""),
    notificationDisabled: false,
  });
}

/** Cria assinatura recorrente no Asaas */
async function criarAssinatura(customerId, plano, inicioISO) {
  return asaasFetch("/subscriptions", "POST", {
    customer: customerId,
    billingType: "UNDEFINED",   // aluno escolhe na hora: Pix, boleto ou cartão
    value: plano.valor,
    nextDueDate: inicioISO,
    cycle: plano.ciclo,
    description: `Pinaúna Club — ${plano.nome}`,
    maxPayments: plano.ciclo === "MONTHLY" ? null : null, // null = sem fim
    externalReference: `pinauna_${Date.now()}`,
  });
}

/** Aplica desconto de 1 mês no próximo vencimento do indicador */
async function aplicarDescontoIndicador(cpfIndicador, valorDesconto) {
  const cpfLimpo = cpfIndicador.replace(/\D/g, "");
  const busca = await asaasFetch(`/customers?cpfCnpj=${cpfLimpo}`);
  if (!busca.data?.length) return { ok: false, msg: "Indicador não encontrado" };

  const indicadorId = busca.data[0].id;

  // Busca assinaturas ativas do indicador
  const subs = await asaasFetch(`/subscriptions?customer=${indicadorId}&status=ACTIVE`);
  if (!subs.data?.length) return { ok: false, msg: "Indicador sem assinatura ativa" };

  const subId = subs.data[0].id;

  // Cria desconto na próxima cobrança da assinatura
  await asaasFetch(`/subscriptions/${subId}`, "POST", {
    discount: {
      value: valorDesconto,
      type: "FIXED",
      dueDateLimitDays: 0,
    },
  });

  return { ok: true, indicadorId };
}

/** Extrai o IP real do aluno a partir dos headers repassados pelo Netlify */
function getClientIp(event) {
  const headers = event.headers || {};
  const forwarded = headers["x-nf-client-connection-ip"] || headers["client-ip"] || headers["x-forwarded-for"];
  if (!forwarded) return null;
  return forwarded.split(",")[0].trim();
}

/**
 * Grava o registro de aceite do termo de responsabilidade + declaração de saúde
 * como prova, num Netlify Blobs store dedicado. Não bloqueia a matrícula se falhar.
 */
async function registrarConsentimento(registro) {
  try {
    const store = getStore("consentimentos-pinauna");
    const chave = `${registro.cpf}__${Date.now()}`;
    await store.setJSON(chave, registro);
    return chave;
  } catch (err) {
    console.error("Falha ao gravar consentimento no Blobs:", err.message);
    return null;
  }
}

/** Acrescenta uma nota de aceite do termo nas observações do cliente no Asaas (best-effort) */
async function anotarConsentimentoNoAsaas(customerId, nota) {
  try {
    const cliente = await asaasFetch(`/customers/${customerId}`);
    const observacoesAtuais = cliente.observations ? `${cliente.observations}\n` : "";
    await asaasFetch(`/customers/${customerId}`, "POST", {
      observations: `${observacoesAtuais}${nota}`.slice(0, 3900), // Asaas limita o campo a 4000 caracteres
    });
  } catch (err) {
    console.error("Falha ao anotar consentimento no Asaas:", err.message);
  }
}

// ── Handler principal ──────────────────────────────────────────────────────

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": process.env.URL || "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ erro: "Método não permitido" }) };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const {
      nome, email, cpf, fone, plano_id, codigo_indicacao,
      termo_aceito, termo_versao, termo_aceito_em,
    } = body;

    // Validações básicas
    if (!nome || !email || !cpf || !fone || !plano_id) {
      return { statusCode: 400, headers, body: JSON.stringify({ erro: "Campos obrigatórios: nome, email, cpf, fone, plano_id" }) };
    }

    // Termo de responsabilidade e declaração de saúde é obrigatório
    if (termo_aceito !== true || !termo_versao) {
      return { statusCode: 400, headers, body: JSON.stringify({ erro: "É necessário aceitar o termo de responsabilidade para concluir a matrícula." }) };
    }

    const plano = PLANOS[plano_id];
    if (!plano) {
      return { statusCode: 400, headers, body: JSON.stringify({ erro: "Plano inválido" }) };
    }

    // 1. Criar/buscar cliente
    const cliente = await upsertCliente({ nome, email, cpfCnpj: cpf, fone });

    // 2. Data de início = hoje
    const hoje = new Date();
    const inicioISO = hoje.toISOString().split("T")[0];

    // 3. Criar assinatura
    const assinatura = await criarAssinatura(cliente.id, plano, inicioISO);

    // 4. Processar indicação (apenas para semestral e anual)
    let indicacaoResultado = null;
    if (codigo_indicacao && (plano.meses >= 6)) {
      const valorMensal = plano.valor / plano.meses;
      indicacaoResultado = await aplicarDescontoIndicador(codigo_indicacao, valorMensal);
    }

    // 5. Registrar o aceite do termo (prova de consentimento) — não bloqueia a matrícula se falhar
    const cpfLimpo = cpf.replace(/\D/g, "");
    const registroConsentimento = {
      nome,
      email,
      cpf: cpfLimpo,
      fone: fone.replace(/\D/g, ""),
      plano_id,
      plano_nome: plano.nome,
      cliente_id: cliente.id,
      assinatura_id: assinatura.id,
      termo_versao,
      termo_aceito_em: termo_aceito_em || null,       // horário do navegador do aluno
      termo_registrado_em: hoje.toISOString(),         // horário do servidor (fonte da verdade)
      ip: getClientIp(event),
      user_agent: (event.headers && event.headers["user-agent"]) || null,
    };
    const consentimentoId = await registrarConsentimento(registroConsentimento);
    await anotarConsentimentoNoAsaas(
      cliente.id,
      `Termo de responsabilidade e declaração de saúde aceito em ${registroConsentimento.termo_registrado_em} (versão ${termo_versao}, IP ${registroConsentimento.ip || "desconhecido"}).`
    );

    // 6. Retornar link de pagamento da primeira cobrança
    const cobrancas = await asaasFetch(`/subscriptions/${assinatura.id}/payments?limit=1`);
    const linkPagamento = cobrancas.data?.[0]?.invoiceUrl || null;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        mensagem: `Matrícula realizada! Plano: ${plano.nome}`,
        link_pagamento: linkPagamento,
        assinatura_id: assinatura.id,
        cliente_id: cliente.id,
        consentimento_id: consentimentoId,
        // Código de indicação do NOVO aluno = CPF (simplificado)
        seu_codigo_indicacao: cpfLimpo,
        indicacao: indicacaoResultado,
      }),
    };
  } catch (err) {
    console.error("Erro matricula:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ erro: err.message || "Erro interno" }),
    };
  }
};
