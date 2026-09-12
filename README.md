# Pinaúna Club — Site + Integração Asaas

Sistema completo: landing page + matrícula online + cobrança automática via Asaas (Pix, cartão, boleto).

---

## Estrutura do projeto

```
pinauna/
├── public/
│   └── index.html            ← Landing page completa (planos, termo, modal de matrícula)
├── netlify/
│   └── functions/
│       ├── matricula.js      ← API de matrícula + integração Asaas + registro do termo
│       └── consentimentos.js ← Consulta protegida dos comprovantes de aceite do termo
├── netlify.toml              ← Configuração do Netlify
├── package.json
└── README.md
```

---

## Passo 1 — Criar conta no Asaas

1. Acesse https://www.asaas.com e clique em **Criar conta grátis**
2. Pode criar como **Pessoa Física** (CPF) — não precisa de CNPJ
3. Confirme o e-mail e faça login
4. No painel: **Menu → Integrações → API**
5. Copie sua **chave de API** (começa com `$aact_...`)

> ⚠️ O projeto está configurado para produção (cobranças reais). Copie a chave do painel em https://www.asaas.com (não do sandbox). Veja o Passo 4 se preferir testar no sandbox antes.

---

## Passo 2 — Publicar no Netlify

### Opção A — Via GitHub (recomendado)

1. Crie um repositório no GitHub e envie os arquivos:
```bash
git init
git add .
git commit -m "Pinaúna Club — versão inicial"
git remote add origin https://github.com/SEU_USUARIO/pinauna-club.git
git push -u origin main
```

2. Acesse https://app.netlify.com → **Add new site → Import from Git**
3. Conecte ao GitHub e selecione o repositório
4. Em **Build settings**:
   - Build command: *(deixe em branco)*
   - Publish directory: `public`
5. Clique em **Deploy site**

### Opção B — Arrastar e soltar (mais rápido para testar)

1. Acesse https://app.netlify.com
2. Arraste a pasta `public` para a área de deploy
3. *(As funções não vão funcionar nesse método — use apenas para ver o visual)*

---

## Passo 3 — Configurar as variáveis de ambiente

Essa é a parte mais importante — a chave do Asaas **nunca deve ficar no código**.

1. No painel do Netlify, vá em **Site settings → Environment variables**
2. Clique em **Add a variable** e configure:
   - **Key:** `ASAAS_API_KEY`
   - **Value:** sua chave copiada do Asaas (ex: `$aact_YTU5YTE0M...`)
3. Adicione uma segunda variável para proteger a consulta dos comprovantes de aceite do termo:
   - **Key:** `ADMIN_API_KEY`
   - **Value:** uma senha forte qualquer, só sua (ex: gere uma em https://1password.com/password-generator/) — **não** é a chave do Asaas
4. Clique em **Save**
5. Vá em **Deploys → Trigger deploy** para reaplicar com as variáveis

---

## Passo 4 — Ambiente do Asaas (produção x sandbox)

O código já está apontando para a API de **produção** (`https://api.asaas.com/v3`), então cobranças geradas são reais. A `ASAAS_API_KEY` configurada no Netlify precisa ser uma chave de **produção** (painel em https://www.asaas.com, não o sandbox) — se colar uma chave sandbox aqui, o Asaas recusa com o erro "chave não pertence a este ambiente".

Se quiser voltar a testar sem gerar cobranças reais:

1. Abra `netlify/functions/matricula.js` e troque a linha do `ASAAS_BASE` de volta para `https://sandbox.asaas.com/api/v3`
2. No Netlify, troque a `ASAAS_API_KEY` pela chave de **sandbox** (painel em https://sandbox.asaas.com)
3. Redeploy

---

## Como funciona o fluxo de matrícula

```
Aluno acessa a página
       ↓
Escolhe dias + periodicidade (mensal/tri/sem/anual)
       ↓
Clica em "Matricular agora"
       ↓
Preenche nome, e-mail, CPF, WhatsApp
(+ código de indicação se tiver)
       ↓
Lê e aceita o termo de responsabilidade + declaração de saúde
(obrigatório — sem isso não avança)
       ↓
Frontend envia POST /api/matricula
       ↓
netlify/functions/matricula.js:
  1. Rejeita se o termo não foi aceito
  2. Busca ou cria cliente no Asaas
  3. Cria assinatura recorrente (ciclo correto)
  4. Se tem indicação válida → aplica desconto no indicador
  5. Grava o comprovante do aceite (Netlify Blobs + observação no Asaas)
  6. Retorna link de pagamento
       ↓
Aluno é redirecionado para página de pagamento Asaas
(escolhe Pix, cartão ou boleto)
       ↓
Asaas confirma pagamento → envia e-mail para o aluno
Asaas notifica você via dashboard + e-mail
```

---

## Termo de responsabilidade e declaração de saúde

Antes de confirmar a matrícula, o aluno passa por uma etapa obrigatória no modal:

1. Lê o termo de responsabilidade (riscos da natação em águas abertas) e a declaração de saúde (não ter condição que impeça a prática, ou ter liberação médica).
2. Marca o checkbox "Li e concordo...". Sem isso, o botão de matrícula não avança — a validação existe tanto no navegador quanto na função (o backend rejeita a matrícula se `termo_aceito` não vier `true`).
3. Ao confirmar, o servidor grava um **registro de prova** com nome, CPF, e-mail, versão do termo, horário do servidor e do navegador, IP e user-agent — isso fica salvo no **Netlify Blobs** (armazenamento incluso no plano Free) e também é anotado nas observações do cliente no **Asaas**, como uma segunda cópia.

⚠️ **Importante:** o texto do termo incluído no site é um rascunho de referência, escrito para cobrir os pontos mais comuns (riscos do mar, declaração de saúde, isenção por riscos inerentes, validade do aceite eletrônico). Não é aconselhamento jurídico — vale a pena mandar para um advogado revisar antes de operar de verdade, principalmente a cláusula de isenção de responsabilidade, que tem limites legais (ela não afasta responsabilidade por negligência grave/dolo da escola).

### Como consultar um comprovante de aceite depois

Se precisar comprovar que um aluno aceitou o termo (por exemplo, após um incidente), use a função `consentimentos`:

```bash
curl "https://SEU-SITE.netlify.app/api/consentimentos?cpf=12345678900" \
  -H "x-admin-key: SUA_ADMIN_API_KEY"
```

Sem informar `cpf`, a chamada retorna todos os registros já gravados. Guarde a `ADMIN_API_KEY` como faria com uma senha — quem tiver essa chave consegue ler os dados pessoais dos alunos.

---

## Cobrança por WhatsApp

Todo aluno que se matricula pelo site já sai com o WhatsApp ligado como canal de cobrança no Asaas, automaticamente (sem precisar mexer em nada no painel):

- **Aviso antes do vencimento:** 5 dias antes da cobrança vencer
- **Lembrete de cobrança vencida:** a cada 7 dias enquanto não for paga, até 3 mensagens (comportamento padrão do Asaas para esse evento)

Isso é feito pela função `matricula.js` logo depois de criar o cliente no Asaas (`GET /customers/{id}/notifications` + `PUT /notifications/{id}`), sem desligar e-mail/SMS — só acrescenta o WhatsApp. Se a chamada falhar por qualquer motivo, a matrícula segue normalmente (best-effort).

⚠️ Cada notificação por WhatsApp é cobrada pelo Asaas (consulte o valor vigente em Configurações → Taxas na sua conta) — no pior caso (aluno que nunca paga), são até 4 mensagens por cobrança.

---

## Evento — Pinaúna Club 4ª Edição (Troféu Ana Serra)

Subpágina separada da matrícula mensal, para inscrição e controle da competição de 01/11/2026.

### Páginas

- **`/evento/`** — página pública com o poster, informações do evento e a ficha de inscrição (reproduz os campos do formulário original + CPF, que o Asaas exige e o formulário não pedia).
- **`/evento/inscritos/`** — tela com a lista completa de inscritos, protegida pela mesma `ADMIN_API_KEY`. Mostra todos os inscritos (todas as provas) com número, nome, categoria, idade calculada na data da prova, prova, camisa, telefone (com link direto pro WhatsApp), status de pagamento e data de inscrição. Tem resumo (total, pagos, pendentes, valor arrecadado), filtro por prova/status/busca, botão "Atualizar pagamentos" (confere no Asaas), botão "Marcar pago" (pagamento recebido por fora), botão "Corrigir cadastro" (categoria/data de nascimento erradas) e exportação em CSV.
- **`/evento/controle/`** — tela de controle de chegada, protegida pela mesma `ADMIN_API_KEY`. No dia da prova, escolha a prova (2km/500m/200m/Aquathlon) e toque no nome de cada atleta conforme ele chega na borda — a ordem dos toques vira a posição. Tem botão "Desfazer" pra corrigir toque errado e link pra lista completa de inscritos.
- **`/evento/ranking/`** — página pública com o ranking ao vivo, separado por categoria dentro de cada prova, atualizando sozinha a cada 5s (boa para projetar num telão).

### Funções (Netlify)

- `evento-inscricao.js` — recebe a ficha, cria/reaproveita o cliente no Asaas e gera uma **cobrança avulsa de R$150** (não uma assinatura — por isso não entra na régua nem nos relatórios das mensalidades). A referência da cobrança é `evento_pinauna-4ed-2026_<cpf>`, fácil de filtrar no painel do Asaas separado do resto.
- `evento-status.js` (admin) — lista os inscritos; com `?sync=true` confere no Asaas se cada cobrança pendente já foi paga, atualiza o registro e **atribui o número do participante** assim que o pagamento é confirmado. É o que o botão "Atualizar pagamentos" chama (na lista de inscritos e no controle de chegada).
- `evento-marcar-pago.js` (admin) — confirma manualmente quem pagou por fora do link (dinheiro/Pix direto ao professor). Usa o endpoint oficial do Asaas `receiveInCash` pra marcar a cobrança como recebida (sem gerar movimentação financeira real na conta nem continuar cobrando quem já pagou), atribui o número do participante e marca o registro com `pago_manualmente: true` — a lista de inscritos mostra um selo "recebido direto" nesses casos, pra diferenciar de quem pagou pelo link. É o botão "Marcar pago" na lista de inscritos.
- `evento-editar-inscrito.js` (admin) — corrige categoria e/ou data de nascimento de um inscrito, pra quando a pessoa erra o preenchimento da própria ficha. Não mexe em pagamento. Guarda um histórico simples (últimas 10 alterações) dentro do próprio registro. É o botão "Corrigir cadastro" na lista de inscritos, que abre um formulário com a categoria certa (mesmo select da ficha pública) e a data de nascimento.
- `evento-chegada.js` (admin) — registra/desfaz a chegada de um atleta numa prova.
- `evento-ranking.js` (pública) — calcula a colocação geral e por categoria a partir da ordem de chegada.

**Numeração dos participantes:** sequencial, única para o evento todo (não por categoria/prova), começando em 100. É atribuída automaticamente só no momento em que o pagamento é confirmado (por sync com o Asaas ou por confirmação manual) — quem nunca chega a pagar não consome número. O contador fica salvo num Netlify Blobs store próprio (`evento-4ed-contador`).

Os dados do evento (inscrições, chegadas e o contador de numeração) ficam em Netlify Blobs stores próprios (`evento-4ed-inscricoes`, `evento-4ed-chegadas`, `evento-4ed-contador`), completamente separados dos dados de matrícula/mensalidade.

⚠️ Como é um evento pontual, a confirmação de pagamento **não é automática via webhook** — é feita sob demanda pelo botão "Atualizar pagamentos" (na lista de inscritos ou no controle de chegada), que evita ter que configurar um webhook na conta Asaas. Antes do dia da prova, vale clicar nesse botão pra atualizar quem já pagou e garantir que todo mundo confirmado já tenha número.

Nenhuma variável de ambiente nova é necessária — reaproveita `ASAAS_API_KEY` e `ADMIN_API_KEY` já configuradas.

---

## Programa Indique & Ganhe

- **Quem pode indicar:** apenas alunos com plano semestral ou anual
- **Código de indicação:** o CPF do aluno (sem formatação)
- **Benefício para o indicador:** 1 mês de desconto na próxima cobrança
- **Benefício para o novo aluno:** nenhum (pode adicionar se quiser)
- **Aplicação:** automática via API na hora que o novo aluno se matricular

---

## Tabela de planos e valores

| Dias          | Mensal | Trimestral (-5%) | Semestral (-10%) | Anual (-15%) |
|---------------|--------|------------------|------------------|--------------|
| Quarta        | R$75   | R$214            | R$405            | R$765        |
| Sábado        | R$75   | R$214            | R$405            | R$765        |
| Domingo       | R$100  | R$285            | R$540            | R$1.020      |
| Qua + Sáb     | R$135  | R$385            | R$729            | R$1.377      |
| Qua + Dom     | R$150  | R$428            | R$810            | R$1.530      |
| Sáb + Dom     | R$150  | R$428            | R$810            | R$1.530      |
| Completo      | R$200  | R$570            | R$1.080          | R$2.040      |

---

## Taxas do Asaas (estimativa)

| Forma         | Taxa                              |
|---------------|-----------------------------------|
| Pix           | R$1,99/transação (R$0,99 por 3m)  |
| Boleto        | R$1,99/transação (R$0,99 por 3m)  |
| Cartão crédito| 2,99% + R$0,49 (1,99% por 3m)     |
| Mensalidade   | R$0 (gratuito)                    |

---

## Dúvidas frequentes

**O aluno precisa pagar todo mês?**  
Sim. O Asaas gera a cobrança automaticamente no vencimento e notifica o aluno por e-mail/WhatsApp.

**E se o cartão do aluno for recusado?**  
O Asaas tenta novamente automaticamente e você recebe notificação.

**Onde vejo quem pagou?**  
No dashboard do Asaas em https://asaas.com → Cobranças → Assinaturas.

**Posso personalizar o e-mail que o aluno recebe?**  
Sim. No Asaas: Configurações → Notificações → Personalizar template.

---

## Suporte

- Documentação Asaas: https://docs.asaas.com
- Documentação Netlify Functions: https://docs.netlify.com/functions/overview
- WhatsApp Pinaúna: 71 98892-4797
