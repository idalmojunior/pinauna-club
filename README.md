# Pinaúna Club — Site + Integração Asaas

Sistema completo: landing page + matrícula online + cobrança automática via Asaas (Pix, cartão, boleto).

---

## Estrutura do projeto

```
pinauna/
├── public/
│   └── index.html          ← Landing page completa
├── netlify/
│   └── functions/
│       └── matricula.js    ← API de matrícula + integração Asaas
├── netlify.toml            ← Configuração do Netlify
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

> ⚠️ Para testes, use o ambiente sandbox: https://sandbox.asaas.com  
> A chave sandbox começa com `$aact_YTU5YTE0M...`  
> Quando tudo funcionar, troque para a API de produção.

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

## Passo 3 — Configurar a variável de ambiente

Essa é a parte mais importante — a chave do Asaas **nunca deve ficar no código**.

1. No painel do Netlify, vá em **Site settings → Environment variables**
2. Clique em **Add a variable**
3. Configure:
   - **Key:** `ASAAS_API_KEY`
   - **Value:** sua chave copiada do Asaas (ex: `$aact_YTU5YTE0M...`)
4. Clique em **Save**
5. Vá em **Deploys → Trigger deploy** para reaplicar com a variável

---

## Passo 4 — Trocar sandbox por produção

Quando quiser ativar pagamentos reais:

1. Abra `netlify/functions/matricula.js`
2. Na linha 1, mude:
```js
// ANTES (testes):
const ASAAS_BASE = "https://sandbox.asaas.com/api/v3";

// DEPOIS (produção):
const ASAAS_BASE = "https://api.asaas.com/api/v3";
```
3. No Netlify, atualize a variável `ASAAS_API_KEY` com a chave de **produção**
4. Redeploy

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
Frontend envia POST /api/matricula
       ↓
netlify/functions/matricula.js:
  1. Busca ou cria cliente no Asaas
  2. Cria assinatura recorrente (ciclo correto)
  3. Se tem indicação válida → aplica desconto no indicador
  4. Retorna link de pagamento
       ↓
Aluno é redirecionado para página de pagamento Asaas
(escolhe Pix, cartão ou boleto)
       ↓
Asaas confirma pagamento → envia e-mail para o aluno
Asaas notifica você via dashboard + e-mail
```

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
