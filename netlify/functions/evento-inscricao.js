/**
 * Pinaúna Club — Inscrição no evento "4ª Edição — Troféu Ana Serra"
 * Netlify Function: POST /api/evento-inscricao
 *
 * Diferente da matrícula mensal, aqui é gerada uma cobrança AVULSA (não recorrente)
 * no Asaas — propositalmente separada das assinaturas dos alunos: aparece em
 * "Cobranças avulsas" no painel, nunca em "Assinaturas", e carrega uma referência
 * própria (evento_pinauna-4ed-2026_<cpf>) fácil de filtrar/buscar.
 */

const { getStoreResiliente } = require("../../lib/blobs");
const { asaasFetch, upsertCliente, getClientIp } = require("../../lib/asaas");

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

function store() {
  return getStoreResiliente("evento-4ed-inscricoes");
}

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
      nome, data_nascimento, email, cpf, rg, telefone,
      clube, prova, categoria, tamanho_camisa,
      termo_aceito, termo_aceito_em,
    } = body;

    if (!nome || !data_nascimento || !email || !cpf || !rg || !telefone || !prova || !categoria || !tamanho_camisa) {
      return { statusCode: 400, headers, body: JSON.stringify({ erro: "Preencha todos os campos obrigatórios." }) };
    }
    if (!PROVAS_VALIDAS.includes(prova)) {
      return { statusCode: 400, headers, body: JSON.stringify({ erro: "Prova inválida." }) };
    }
    if (!CATEGORIAS_VALIDAS.includes(categoria)) {
      return { statusCode: 400, headers, body: JSON.stringify({ erro: "Categoria inválida." }) };
    }
    if (!TAMANHOS_VALIDOS.includes(tamanho_camisa)) {
      return { statusCode: 400, headers, body: JSON.stringify({ erro: "Tamanho de camisa inválido." }) };
    }
    if (termo_aceito !== true) {
      return { statusCode: 400, headers, body: JSON.stringify({ erro: "É necessário aceitar o termo de responsabilidade." }) };
    }

    const cpfLimpo = cpf.replace(/\D/g, "");
    if (cpfLimpo.length !== 11) {
      return { statusCode: 400, headers, body: JSON.stringify({ erro: "CPF inválido." }) };
    }

    // Já inscrito? Não gera cobrança duplicada — devolve o link já emitido.
    const existente = await (await store()).get(cpfLimpo, { type: "json" });
    if (existente && existente.evento_id === EVENTO_ID) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          ja_inscrito: true,
          mensagem:
            existente.status_pagamento === "CONFIRMED"
              ? "Você já está inscrito e o pagamento já foi confirmado! Nos vemos na prova."
              : "Você já tinha se inscrito. Aqui está o link de pagamento novamente.",
          link_pagamento: existente.link_pagamento || null,
          status_pagamento: existente.status_pagamento,
        }),
      };
    }

    // 1. Criar/buscar cliente no Asaas
    const cliente = await upsertCliente({ nome, email, cpfCnpj: cpfLimpo, fone: telefone });

    // 2. Criar cobrança AVULSA (não é assinatura — não entra na régua das mensalidades)
    const hoje = new Date();
    const vencimento = new Date(hoje.getTime() + PRAZO_PAGAMENTO_DIAS * 24 * 60 * 60 * 1000);
    const cobranca = await asaasFetch("/payments", "POST", {
      customer: cliente.id,
      billingType: "UNDEFINED", // aluno escolhe: Pix, cartão ou boleto
      value: VALOR_INSCRICAO,
      dueDate: vencimento.toISOString().split("T")[0],
      description: `${EVENTO_NOME} — Inscrição (${prova} / ${categoria})`,
      externalReference: `evento_${EVENTO_ID}_${cpfLimpo}`,
    });

    // 3. Registrar a inscrição no Blobs — fonte da verdade do evento
    const registro = {
      evento_id: EVENTO_ID,
      nome,
      data_nascimento,
      email,
      cpf: cpfLimpo,
      rg,
      telefone: telefone.replace(/\D/g, ""),
      clube: clube || null,
      prova,
      categoria,
      tamanho_camisa,
      cliente_id: cliente.id,
      pagamento_id: cobranca.id,
      valor: VALOR_INSCRICAO,
      status_pagamento: "PENDING",
      link_pagamento: cobranca.invoiceUrl || null,
      termo_versao: TERMO_VERSAO_EVENTO,
      termo_aceito_em: termo_aceito_em || null,
      termo_registrado_em: hoje.toISOString(),
      ip: getClientIp(event),
      user_agent: (event.headers && event.headers["user-agent"]) || null,
      inscrito_em: hoje.toISOString(),
    };

    await (await store()).setJSON(cpfLimpo, registro);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        mensagem: "Inscrição registrada! Finalize o pagamento para confirmar sua vaga.",
        link_pagamento: cobranca.invoiceUrl || null,
        pagamento_id: cobranca.id,
      }),
    };
  } catch (err) {
    console.error("Erro evento-inscricao:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ erro: err.message || "Erro interno" }) };
  }
};
