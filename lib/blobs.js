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

module.exports = { getStoreResiliente };
