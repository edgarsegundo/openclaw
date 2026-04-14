# SPEC — Task: oferecer-seguro

## Objetivo

Automatizar o processo de identificar clientes com intenção de viagem próxima (campo `data_viagem` em `clientes.json`) e lembrar o operador, via Discord, de entrar em contato oferecendo seguro viagem com desconto. A mensagem já inclui um link para WhatsApp Business com texto personalizado e 10% de desconto, promovendo a parceria com [compararsegurodeviagem.com.br](https://compararsegurodeviagem.com.br).

---

## Fluxo de execução

1. **Leitura dos dados**
   - Carregar o arquivo `clientes.json` (array de clientes).
   - Cada cliente possui pelo menos: `nome`, `data_viagem`, `telefone` (WhatsApp).

2. **Seleção dos clientes**
   - Selecionar clientes cuja `data_viagem` esteja entre **hoje** e **14 dias à frente**.
   - Não repetir clientes já notificados anteriormente (persistência explicada abaixo).

3. **Envio de lembrete**
   - Para cada cliente novo na janela, enviar mensagem via Discord (usando webhook e função `notifyDiscord` da `lib/discord.js`).
   - Mensagem inclui:
     - Nome do cliente
     - Data da viagem (formato amigável)
     - Link para WhatsApp Business já com mensagem pronta, oferecendo 10% de desconto para cotação de seguro viagem.


4. **Persistência e deduplicação (usando SQLite)**
   - **Decisão:** Usar uma tabela SQLite para registrar clientes já notificados.
   - **Justificativa:** Mais robusto, permite consultas, updates e histórico. Segue padrão do projeto (ver exemplo em `edgar/automations/visa-crawler/db.js`).
   - **Tabela sugerida:** `notificacoes_seguros`
     - Campos:
       - `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
       - `nome` (TEXT)
       - `telefone` (TEXT)
       - `data_viagem` (DATE)
       - `data_notificacao` (DATETIME)
       - `mensagem_enviada` (BOOLEAN)
       - `mensagem_id` (TEXT, opcional, se quiser guardar id Discord)
       - `extra` (TEXT, opcional, para JSON com outros dados)
       - UNIQUE(telefone, data_viagem)
   - **Lógica:**
     - Antes de notificar, consultar se já existe registro para o telefone+data_viagem.
     - Se não existe, enviar mensagem e inserir registro.
     - Se já existe, pular.
   - **Limpeza:** Opcionalmente, remover registros de viagens passadas.


   **Exemplo de criação da tabela (final):**
   ```js
   db.exec(`
     CREATE TABLE IF NOT EXISTS notificacoes_seguros (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       nome TEXT NOT NULL,
       telefone TEXT NOT NULL,
       data_viagem DATE NOT NULL,
       data_notificacao DATETIME,
       UNIQUE(telefone, data_viagem)
     );
   `);
   ```

   - O campo `data_notificacao` deve ser preenchido apenas quando a mensagem for realmente enviada ao Discord. Se for NULL, significa que ainda não foi notificado.

   **Exemplo de inserção:**
   ```js
   db.prepare(`
     INSERT OR IGNORE INTO notificacoes_seguros (nome, telefone, data_viagem)
     VALUES (?, ?, ?)
   `).run(nome, telefone, data_viagem);
   ```

   **Exemplo de consulta:**
   ```js
   const jaNotificado = db.prepare(`
     SELECT 1 FROM notificacoes_seguros WHERE telefone = ? AND data_viagem = ?
   `).get(telefone, data_viagem);
   ```

   **Script para popular a tabela a partir do clientes.json:**
   ```js
   // scripts/import-clientes.js
   import fs from "fs";
   import path from "path";
   import Database from "better-sqlite3";

   const db = new Database("cron-manager.db");
   db.exec(`
     CREATE TABLE IF NOT EXISTS notificacoes_seguros (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       nome TEXT NOT NULL,
       telefone TEXT NOT NULL,
       data_viagem DATE NOT NULL,
       data_notificacao DATETIME,
       UNIQUE(telefone, data_viagem)
     );
   `);

   const clientes = JSON.parse(fs.readFileSync("tasks/oferecer-seguro/clientes.json", "utf8"));
   const stmt = db.prepare(`
     INSERT OR IGNORE INTO notificacoes_seguros (nome, telefone, data_viagem)
     VALUES (?, ?, ?)
   `);

   for (const c of clientes) {
     stmt.run(c.nome, c.telefone, c.data_viagem);
   }

   console.log("Importação concluída.");
   ```

   - **Uso:** `node scripts/import-clientes.js`
   - **Depois:** A task pode atualizar o campo `mensagem_enviada` e `data_notificacao` ao enviar a mensagem.

---

## Detalhes da mensagem

- Exemplo de mensagem enviada via Discord:
  ```
  Lembrete: Entrar em contato com João da Silva (viagem em 22/04/2026).
  👉 [Abrir WhatsApp Business](https://wa.me/5511999999999?text=Olá%20João!%20Vi%20que%20sua%20viagem%20está%20próxima.%20Posso%20fazer%20uma%20cotação%20de%20seguro%20viagem%20com%2010%%20de%20desconto%20pela%20CompararSeguroDeViagem.com.br.%20Se%20tiver%20interesse,%20me%20avise!)
  ```

---

## Ideias e melhorias possíveis

- **Evitar repetições por telefone+data:** já garantido pela UNIQUE da tabela.
- **Notificações agrupadas:** se houver muitos clientes no mesmo dia, enviar uma mensagem única com todos.
- **Logs:** registrar no log cada notificação enviada e cada cliente pulado por já ter sido notificado.
- **Configuração flexível:** permitir ajustar a janela de dias via input/env.
- **Mensagem customizável:** permitir editar o texto padrão via input/env.
- **Fallback:** se o Discord falhar, registrar alerta no log.
- **Relatório diário:** opcionalmente, enviar um resumo diário com total de clientes notificados.
- **Validação de telefone:** garantir que o número está no formato internacional para o link do WhatsApp.
- **Suporte a múltiplos canais:** permitir múltiplos webhooks, se necessário.
- **Modo dry-run:** opção para simular sem enviar mensagens (útil para testes).

---

## Observações

- O arquivo `clientes.json` deve estar sempre atualizado antes da execução da task.
- O webhook do Discord será informado via variável de ambiente ou arquivo `.env`.
- O agendamento (cron) será configurado externamente, mas a task deve ser idempotente e segura para rodar diariamente.

---

## Pontos para discussão

- Alguma preferência de formato para o campo `extra`? (JSON livre, observações, etc)
- Deseja notificação individual ou agrupada por dia?
- Alguma lógica especial para clientes que mudam a data da viagem?
- Alguma integração futura desejada (ex: envio automático do WhatsApp, integração com CRM)?

---
