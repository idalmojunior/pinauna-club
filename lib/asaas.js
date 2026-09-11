/**
 * Pinaúna Club — Helpers compartilhados de integração com o Asaas
 * Usado pelas funções do evento (inscrição, status de pagamento, chegada).
 * (A função de matrícula/mensalidade — netlify/functions/matricula.js — mantém sua
 * própria cópia independente, já testada em produção; não foi alterada por este arquivo.)
 */

const ASAAS_BASE = "https://api.asaas.com/v3"; // Produção — endereço novo (sem "/api" no caminho)

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
  const texto = await res.text();

  let data = null;
  if (texto) {
    try {
      data = JSON.parse(texto);
    } catch (e) {
      console.error(`Asaas resposta não-JSON [${method} ${path}] status ${res.status}:`, texto.slice(0, 500));
      throw new Error(`Asaas retornou resposta inválida (status ${res.status}). Verifique a ASAAS_API_KEY no Netlify.`);
    }
  }

  if (!res.ok) {
    console.error(`Asaas erro [${method} ${path}] status ${res.status}:`, JSON.stringify(data));
    throw new Error(
      data?.errors?.[0]?.description ||
        `Asaas error ${res.status}${texto ? "" : " (resposta vazia — provável ASAAS_API_KEY ausente ou incorreta)"}`
    );
  }

  return data;
}

/** Busca cliente pelo CPF; cria se não existir. Reaproveita o mesmo cadastro de cliente
 *  usado pelas mensalidades — o que muda é o TIPO de cobrança (avulsa aqui, assinatura lá). */
async function upsertCliente({ nome, email, cpfCnpj, fone }) {
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

/** Extrai o IP real do requisitante a partir dos headers repassados pelo Netlify */
function getClientIp(event) {
  const headers = event.headers || {};
  const forwarded = headers["x-nf-client-connection-ip"] || headers["client-ip"] || headers["x-forwarded-for"];
  if (!forwarded) return null;
  return forwarded.split(",")[0].trim();
}

/** Confere o header x-admin-key contra a variável de ambiente ADMIN_API_KEY */
function checarAdmin(event) {
  const chaveEnviada = event.headers?.["x-admin-key"];
  return Boolean(process.env.ADMIN_API_KEY) && chaveEnviada === process.env.ADMIN_API_KEY;
}

module.exports = { ASAAS_BASE, asaasHeaders, asaasFetch, upsertCliente, getClientIp, checarAdmin };
