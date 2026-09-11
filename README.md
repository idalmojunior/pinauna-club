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

O código já está apontando para a API de **produção** (`https://api.asaas.com/api/v3`), então cobranças geradas são reais. A `ASAAS_API_KEY` configurada no Netlify precisa ser uma chave de **produção** (painel em https://www.asaas.com, não o sandbox) — se colar uma chave sandbox aqui, o Asaas recusa com o erro "chave não pertence a este ambiente".

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
