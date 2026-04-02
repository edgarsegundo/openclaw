# Guia de Criação de Novas Automações no OpenClaw

Este documento serve como referência para criar novas automações (jobs determinísticos) no OpenClaw, aproveitando padrões, módulos e práticas do projeto `visa-crawler` e do modelo de automations. Inclui dicas para integração com a API e disparo de prompts para IA.

---

## 1. Estrutura Recomendada de Pastas

Cada automação deve ficar em sua própria pasta dentro de `edgar/automations/`:

```
edgar/automations/
  nova-automation/
    index.js
    AUTOMATION.md
    ...
```

- `index.js`: código principal do job
- `AUTOMATION.md`: documentação explicando o objetivo e como agendar
- Outras dependências/módulos conforme necessário

---

## 2. Padrões e Componentes Reutilizáveis

- **Logger centralizado** (`logger.js`): logging padronizado
- **Banco de dados** (`db.js`): abstração para persistência, runs, entidades
- **Notificações externas** (`discord.js`): envio de status para Discord (ou adapte para outros canais)
- **Helpers**: funções utilitárias como `sleep(ms)`, tratamento de argumentos, etc.
- **Configuração via `.env`**: use variáveis de ambiente para parâmetros sensíveis

---

## 3. Fluxo Sugerido para o index.js

1. Carregar variáveis de ambiente e dependências
2. Abrir conexão com banco (se necessário)
3. Buscar entidades a processar (ex: países, usuários, tarefas)
4. Permitir filtragem via argumentos
5. Loop principal processando cada entidade, com tratamento de erros individual
6. Rate limit entre execuções (se necessário)
7. Coletar métricas de sucesso, divergências e erros
8. Atualizar status no banco e enviar resumo para canal externo
9. Fechar recursos

---

## 4. Como Documentar e Agendar o Job

Crie um `AUTOMATION.md` explicando:

- O que o job faz
- Como agendar via cron:

```bash
openclaw cron add \
  --agent default \
  --name "<nome-do-job>" \
  --every <intervalo> \
  --message "run" \
  --no-deliver \
  --thinking off \
  --session isolated
```

- `--agent default`: roda local, zero token
- `--message "run"`: necessário para jobs isolados
- `--no-deliver` + `--session isolated`: impede envio de mensagens à sessão principal
- `--thinking off`: desativa qualquer processamento LLM

---

## 5. Integração com a API do OpenClaw

### Acessando a API

A API do OpenClaw pode ser acessada localmente (ou remotamente, se configurado) via HTTP. Exemplo de requisição usando `curl`:

```bash
curl -X POST http://localhost:18789/api/v1/agent/prompt \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Seu prompt aqui",
    "session": "isolated",
    "agent": "default"
  }'
```

- O endpoint `/api/v1/agent/prompt` permite disparar prompts para a IA.
- O campo `message` é o texto enviado para a IA.
- Use `session: "isolated"` para jobs determinísticos.
- O campo `agent` pode ser "default" ou outro agente configurado.

### Exemplo de disparo de prompt para IA via API em Node.js

```js
import fetch from "node-fetch";

async function dispararPrompt(prompt) {
  const res = await fetch("http://localhost:18789/api/v1/agent/prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: prompt,
      session: "isolated",
      agent: "default",
    }),
  });
  const data = await res.json();
  return data;
}

// Exemplo de uso:
dispararPrompt("Qual a previsão do tempo?").then(console.log);
```

---

## 6. Boas Práticas

- Cada job deve ser independente, em sua própria pasta
- Use caminhos absolutos para scripts externos
- Documente cada job com `AUTOMATION.md`
- Zero LLM → zero token, exceto se chamar skills que usam LLM
- Trate erros de forma granular e registre logs detalhados
- Use variáveis de ambiente para qualquer configuração sensível ou variável

---

## 7. Sugestão de Template para Nova Automação

```
edgar/automations/nova-automation/
  index.js           # fluxo principal
  db.js              # banco de dados (se necessário)
  logger.js          # logging centralizado (reutilizar)
  discord.js         # notificações (opcional)
  docs/
    README.md        # documentação de uso
  logs/              # saída de logs/auditorias
  package.json       # dependências e scripts
  .env.template      # exemplo de variáveis de ambiente
```

---

## 8. Exemplos de Funções Reutilizáveis

- `sleep(ms)`: delay entre execuções
- `notifyDiscord(msg)`: envio de mensagens para canal externo
- `openDatabase()`, `insertRun()`, `finishRun()`: controle de execuções no banco
- `logger.info/warn/error()`: logging padronizado

---

## 9. Conclusão

Seguindo este guia, novas automações serão:

- Fáceis de manter e evoluir
- Consistentes em logs, notificações e tratamento de erros
- Flexíveis para diferentes objetivos e integrações

**Dica:** Sempre que possível, extraia utilitários genéricos para facilitar ainda mais o reuso entre automações futuras.

---

Se precisar de exemplos de código ou templates para algum módulo específico, consulte os arquivos do `visa-crawler` ou peça ajuda!
