/**
 * Pinaúna Club — Tábua de maré real (Porto de Salvador, BA)
 * Netlify Function: GET /api/mare?data=YYYY-MM-DD
 *
 * Antes disso a página usava uma tabela fixa com datas de exemplo inventadas e uma
 * fórmula aproximada pros dias fora dela — nunca foi dado real, por isso batia errado.
 *
 * Fonte real: Open-Meteo Marine API (sea_level_height_msl, gratuita, sem chave — uso
 * comercial pesado exigiria plano pago, mas aqui é ~1 consulta por dia, guardada em
 * cache indefinidamente por data já que maré astronômica prevista não muda com o tempo).
 * https://open-meteo.com/en/docs/marine-weather-api
 *
 * A API só cobre janela de previsão real (passado ~90 dias, futuro ~7 dias a partir de
 * hoje). Fora dessa janela devolvemos uma estimativa sazonal simples, marcada
 * explicitamente como "estimado" — nunca disfarçada de dado real.
 */

const { getStoreResiliente } = require("../../lib/blobs");

// Coordenadas do Porto de Salvador (referência oficial da tábua de maré)
const LAT = -12.9718;
const LON = -38.5108;

const JANELA_PASSADO_DIAS = 90; // margem de segurança sob o limite de 92 da API
const JANELA_FUTURO_DIAS = 7;   // margem de segurança sob o limite de 8 da API

function store() {
  return getStoreResiliente("mare-cache");
}

function diffDias(dataStr, hojeStr) {
  const a = new Date(dataStr + "T00:00:00Z");
  const b = new Date(hojeStr + "T00:00:00Z");
  return Math.round((a - b) / (1000 * 60 * 60 * 24));
}

function dentroDaJanelaReal(dataStr, hojeStr) {
  const diff = diffDias(dataStr, hojeStr);
  return diff >= -JANELA_PASSADO_DIAS && diff <= JANELA_FUTURO_DIAS;
}

/**
 * Encontra máximos/mínimos locais numa série horária contínua e refina a posição/altura
 * com interpolação parabólica (a maré real quase nunca vira exatamente "em cima" de uma
 * amostra horária).
 */
function extrairExtremos(horas, alturas) {
  const extremos = [];
  for (let i = 1; i < alturas.length - 1; i++) {
    const [y0, y1, y2] = [alturas[i - 1], alturas[i], alturas[i + 1]];
    const ehMaximo = y1 > y0 && y1 > y2;
    const ehMinimo = y1 < y0 && y1 < y2;
    if (!ehMaximo && !ehMinimo) continue;

    // Vértice da parábola que passa pelos 3 pontos (offset em horas a partir de i)
    const denom = y0 - 2 * y1 + y2;
    const offset = denom !== 0 ? 0.5 * (y0 - y2) / denom : 0;
    const offsetClamp = Math.max(-0.5, Math.min(0.5, offset));
    const alturaRefinada = y1 - 0.25 * (y0 - y2) * offsetClamp;

    extremos.push({
      h: parseFloat((horas[i] + offsetClamp).toFixed(2)),
      t: parseFloat(alturaRefinada.toFixed(2)),
      a: ehMaximo,
    });
  }
  return extremos;
}

async function buscarExtremosReais(dataStr) {
  const inicio = new Date(dataStr + "T00:00:00Z");
  inicio.setUTCDate(inicio.getUTCDate() - 1);
  const fim = new Date(dataStr + "T00:00:00Z");
  fim.setUTCDate(fim.getUTCDate() + 1);
  const fmt = (d) => d.toISOString().slice(0, 10);

  const url =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${LAT}&longitude=${LON}` +
    `&hourly=sea_level_height_msl&timezone=America%2FBahia` +
    `&start_date=${fmt(inicio)}&end_date=${fmt(fim)}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Open-Meteo respondeu ${res.status}`);
  }
  const json = await res.json();
  const tempos = json?.hourly?.time;
  const alturas = json?.hourly?.sea_level_height_msl;
  if (!Array.isArray(tempos) || !Array.isArray(alturas) || tempos.length !== alturas.length) {
    throw new Error("Resposta da Open-Meteo em formato inesperado (hourly.time / sea_level_height_msl)");
  }

  // Converte os timestamps ISO (já na timezone America/Bahia) em "hora decimal desde o
  // início do dataStr" — pode ser negativo (dia anterior) ou >24 (dia seguinte).
  const inicioDataStr = new Date(dataStr + "T00:00:00");
  const horasRelativas = tempos.map((iso) => {
    const t = new Date(iso);
    return (t - inicioDataStr) / (1000 * 60 * 60);
  });

  const todosExtremos = extrairExtremos(horasRelativas, alturas);
  // Mantém só os extremos que caem dentro do próprio dia (com folga de meia hora nas bordas)
  return todosExtremos.filter((e) => e.h >= -0.5 && e.h <= 24.5).map((e) => ({
    h: parseFloat(Math.max(0, Math.min(23.99, e.h)).toFixed(2)),
    t: e.t,
    a: e.a,
  }));
}

/**
 * Estimativa grosseira só pra quando a data está fora do alcance de previsão real
 * (ex.: consultar a maré do dia do evento, meses à frente). Semi-diurna típica de
 * Salvador, sem pretensão de precisão — o front-end mostra isso marcado como estimativa.
 */
function estimativaSazonal(dataStr) {
  const dia = Math.floor(new Date(dataStr + "T00:00:00Z").getTime() / 86400000);
  const faseLunar = (dia % 29.53) / 29.53; // aproximação do ciclo sizígia/quadratura
  const amplitude = 1.1 + 0.5 * Math.cos(faseLunar * 2 * Math.PI);
  const nivelMedio = 1.3;
  const atrasoDiario = (dia * 0.8) % 12.4; // marés atrasam ~50min/dia
  const base = [0.5, 6.7, 12.9, 19.1].map((h) => (h + atrasoDiario) % 24);
  return base
    .map((h, i) => ({
      h: parseFloat(h.toFixed(2)),
      t: parseFloat((nivelMedio + (i % 2 === 0 ? amplitude : -amplitude)).toFixed(2)),
      a: i % 2 === 0,
    }))
    .sort((a, b) => a.h - b.h);
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": process.env.URL || "*",
    "Content-Type": "application/json",
  };

  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers, body: JSON.stringify({ erro: "Método não permitido" }) };
  }

  const dataStr = event.queryStringParameters?.data;
  if (!dataStr || !/^\d{4}-\d{2}-\d{2}$/.test(dataStr)) {
    return { statusCode: 400, headers, body: JSON.stringify({ erro: "Informe ?data=YYYY-MM-DD" }) };
  }

  const hojeStr = new Date().toISOString().slice(0, 10);
  const real = dentroDaJanelaReal(dataStr, hojeStr);

  try {
    const s = await store();
    const chave = `${dataStr}__${real ? "real" : "estimado"}`;
    const cache = await s.get(chave, { type: "json" });
    if (cache) {
      return { statusCode: 200, headers, body: JSON.stringify(cache) };
    }

    let extremos;
    let fonte;
    if (real) {
      try {
        extremos = await buscarExtremosReais(dataStr);
        fonte = "open-meteo";
      } catch (err) {
        console.error(`Falha ao buscar maré real (${dataStr}), caindo para estimativa:`, err.message);
        extremos = estimativaSazonal(dataStr);
        fonte = "estimativa-fallback";
      }
    } else {
      extremos = estimativaSazonal(dataStr);
      fonte = "estimativa-fora-do-alcance";
    }

    const resultado = { ok: true, data: dataStr, real: fonte === "open-meteo", fonte, extremos };

    // Maré prevista pra uma data fixa não muda — cache sem expiração (só reduz chamadas)
    await s.setJSON(chave, resultado);

    return { statusCode: 200, headers, body: JSON.stringify(resultado) };
  } catch (err) {
    console.error("Erro mare.js:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ erro: err.message || "Erro interno" }) };
  }
};
