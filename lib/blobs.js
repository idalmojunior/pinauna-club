/**
 * Pinaúna Club — Wrapper resiliente para o Netlify Blobs
 *
 * getStore() sem argumentos depende de detecção automática do ambiente pelo Netlify.
 * Nesse projeto essa detecção não está funcionando de forma confiável (erro
 * "MissingBlobsEnvironmentError" mesmo em produção) — por isso, além de tentar de
 * novo algumas vezes, caímos para configuração manual (siteID + token) quando a
 * variável de ambiente NETLIFY_BLOBS_TOKEN estiver definida.
 *
 * NETLIFY_BLOBS_TOKEN: um Personal Access Token gerado em
 * https://app.netlify.com (avatar → User settings → Applications → New access
 * token), configurado como variável de ambiente no site — nunca fica no código.
 */

const { getStore } = require("@netlify/blobs");

// Project ID do site pinauna-club — não é segredo, aparece em
// Configurações do projeto → Geral → "Project ID / Site ID" no painel do Netlify.
const SITE_ID = "70fb2133-3fc0-4f25-a86e-3e072d8188d3";

async function getStoreResiliente(nome, tentativas = 3, atrasoMs = 150) {
  let ultimoErro;

  for (let i = 0; i < tentativas; i++) {
    try {
      return getStore(nome); // detecção automática do Netlify
    } catch (err) {
      ultimoErro = err;
      if (i < tentativas - 1) {
        await new Promise((resolve) => setTimeout(resolve, atrasoMs));
      }
    }
  }

  // Detecção automática indisponível — usa configuração manual, se o token estiver configurado
  if (process.env.NETLIFY_BLOBS_TOKEN) {
    try {
      return getStore(nome, { siteID: SITE_ID, token: process.env.NETLIFY_BLOBS_TOKEN });
    } catch (err) {
      console.error(`Netlify Blobs: configuração manual também falhou (store "${nome}"):`, err.message);
      throw err;
    }
  }

  console.error(
    `Netlify Blobs indisponível após ${tentativas} tentativas (store "${nome}") e NETLIFY_BLOBS_TOKEN não está configurado:`,
    ultimoErro.message
  );
  throw ultimoErro;
}

/**
 * Numeração sequencial dos participantes do evento (peito/touca), começando em 100.
 * Atribuída só no momento em que o pagamento é confirmado — quem nunca paga não consome número.
 * Guarda o próximo número livre numa store dedicada; não é atômico entre chamadas
 * concorrentes, mas isso é aceitável aqui (ações administrativas pontuais, baixo volume).
 */
const NUMERO_INICIAL = 100;

async function proximoNumeroEvento() {
  const store = getStoreResiliente("evento-4ed-contador");
  const s = await store;
  const atual = await s.get("proximo_numero", { type: "text" });
  const numero = atual ? parseInt(atual, 10) : NUMERO_INICIAL;
  await s.set("proximo_numero", String(numero + 1));
  return numero;
}

module.exports = { getStoreResiliente, proximoNumeroEvento };
