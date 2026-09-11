/**
 * Pinaúna Club — Wrapper resiliente para o Netlify Blobs
 *
 * getStore() às vezes lança MissingBlobsEnvironmentError de forma intermitente em
 * produção — falha conhecida de infraestrutura do Netlify (o ambiente de Blobs nem
 * sempre está pronto no exato momento em que a função "esquenta"), não um erro do
 * nosso código. Este helper tenta de novo algumas vezes, com uma pequena espera
 * entre tentativas, antes de desistir e propagar o erro.
 */

const { getStore } = require("@netlify/blobs");

async function getStoreResiliente(nome, tentativas = 4, atrasoMs = 200) {
  let ultimoErro;
  for (let i = 0; i < tentativas; i++) {
    try {
      return getStore(nome);
    } catch (err) {
      ultimoErro = err;
      if (i < tentativas - 1) {
        await new Promise((resolve) => setTimeout(resolve, atrasoMs));
      }
    }
  }
  console.error(`Netlify Blobs indisponível após ${tentativas} tentativas (store "${nome}"):`, ultimoErro.message);
  throw ultimoErro;
}

module.exports = { getStoreResiliente };
