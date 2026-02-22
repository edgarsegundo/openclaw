# Tutorial: Integração OpenClaw + Discord com Múltiplos Agentes

https://claude.ai/chat/55348f76-4790-4079-ba09-166c615bc996

## Visão Geral

Este tutorial documenta o processo completo para criar um agente no OpenClaw conectado a um bot Discord, com um canal dedicado por função. Baseado em experiência real de configuração, incluindo os problemas encontrados e como foram resolvidos.

---

## Parte 1 — Criar o Bot no Discord Developer Portal

### 1.1 Criar a aplicação

1. Acessa **https://discord.com/developers/applications**
2. Clica em **New Application** → dá um nome (ex: `fastvistos`)
3. Vai em **Installation** no menu lateral → em **Install Link** muda para **None** → clica **Save**

> ⚠️ **Problema encontrado:** Ao tentar salvar sem mudar o Install Link, aparece o erro _"Private application cannot have a default authorization link"_. A solução é ir em **Installation → Install Link → None** antes de salvar.

### 1.2 Configurar a aba Bot

1. Clica em **Bot** no menu lateral
2. Em **Privileged Gateway Intents**, ativa os 3 toggles:
   - **Presence Intent**
   - **Server Members Intent**
   - **Message Content Intent**
3. Clica **Save Changes**

> ⚠️ **Observação importante:** Os **Privileged Gateway Intents** ficam na **aba Bot**, não no OAuth2. As duas abas têm seções parecidas, o que causa confusão. O que importa para o bot receber mensagens são os Intents na **aba Bot**.

### 1.3 Gerar o Token

1. Ainda na aba **Bot**, clica **Reset Token** → confirma → **copia e salva o token** em lugar seguro
2. Esse token será usado no OpenClaw

---

## Parte 2 — Criar o Agente no OpenClaw

### 2.1 Rodar o wizard

```bash
openclaw agents add fastvistos
```

O wizard vai perguntar:

- **Workspace directory** → aceita o padrão ou define um caminho (ex: `/opt/openclaw/edgar/state/workspace-fastvistos`)
- **Configure chat channels now?** → **Yes**
- **Select a channel** → seleciona **Discord (Bot API)**
- **Discord account**:
  - Se for o **primeiro bot** → seleciona **default (primary)**
  - Se for o **segundo bot (ou mais)** → seleciona **Add a new account**
- Cola o **token do bot** quando solicitado
- **Configure Discord channels access?** → **Yes**
- **Discord channels access** → seleciona **Allowlist (recommended)**
- **Discord channels allowlist** → digita o nome do canal (ex: `#fastvistos-financeiro`)
- **Configure DM access policies now?** → **No**
- **Route selected channels to this agent now?** → **Yes**

> ⚠️ **Observação:** Cria o canal no Discord **antes** de rodar o wizard, para ter o nome correto na mão.

### 2.2 Verificar o agente criado

```bash
cat /opt/openclaw/edgar/state/openclaw.json
```

Confirma que o `bindings` e o canal estão corretos.

---

## Parte 3 — Criar o Canal no Discord

1. No seu servidor Discord, clica no **+** ao lado de **Text Channels**
2. Nomeia o canal (ex: `fastvistos-financeiro`) — **sem o #**, o Discord coloca automaticamente
3. Clica **Create Channel**

> 💡 **Boa prática:** Use **dash** (`-`) no nome do canal, não underline. Exemplo: `fastvistos-financeiro` em vez de `fastvistos_financeiro`. É o padrão do Discord.

---

## Parte 4 — Convidar o Bot para o Servidor

### 4.1 Gerar a URL de convite

1. No Developer Portal, vai em **OAuth2** → **URL Generator**
2. Em **Scopes**, marca **bot**
3. Em **Bot Permissions → Text Permissions**, marca:
   - **Send Messages**
   - **Read Message History**
4. Em **Integration Type**, deixa **Guild Install**
5. Copia a **Generated URL** no final da página

### 4.2 Autorizar o bot

1. Abre a URL gerada no navegador
2. Seleciona o servidor desejado
3. Clica **Authorize**
4. Aparece a tela de **Success!** confirmando que o bot foi adicionado

---

## Parte 5 — Configurar Permissões do Canal

> ⚠️ **Este passo é crítico e foi o que impediu o bot de responder.** Sem isso, o bot entra no servidor mas não consegue ler o canal.

1. No Discord, clica com botão direito no canal `#fastvistos-financeiro`
2. Vai em **Edit Channel → Permissions**
3. Clica no **+** ao lado de **Roles/Members**
4. Busca e adiciona o bot **fastvistos**
5. Com o bot selecionado, marca ✓ (verde) em:
   - **View Channel**
   - **Send Messages**
   - **Read Message History**
6. Clica **Save Changes**

---

## Parte 6 — Verificar e Reiniciar o Gateway

### 6.1 Verificar status

```bash
openclaw channels status
```

Deve aparecer algo como:
```
Discord default: enabled, configured, running, bot:@fastvistos
```

### 6.2 Verificar se o gateway está rodando (via pm2)

```bash
pm2 list
```

O processo `openclaw` deve estar com status **online**.

### 6.3 Reiniciar após mudanças

```bash
pm2 restart openclaw
```

> ⚠️ **Problema encontrado:** Ao rodar `openclaw doctor --repair`, o sistema instalou um serviço **systemd** que entrou em conflito com o pm2. Sintoma: erro _"Gateway already running (pid XXXXX); lock timeout"_ nos logs.
>
> **Solução:**
> ```bash
> systemctl --user stop openclaw-gateway.service
> systemctl --user disable openclaw-gateway.service
> pm2 restart openclaw
> ```

---

## Parte 7 — Verificar nos Logs

```bash
tail -f /tmp/openclaw/openclaw-2026-02-21.log
```

Quando o bot está funcionando corretamente, aparece:
```
logged in to discord as <ID_DO_BOT>
```

Quando uma mensagem chega e é processada, aparece o log com o canal e o agente respondendo.

> ⚠️ **Problema encontrado:** Nos logs aparecia `"reason":"no-mention" → discord: skipping guild message"`. Isso significa que o bot estava recebendo a mensagem mas ignorando por não ser uma menção direta. A causa real era a falta de permissão no canal — após adicionar o bot nas permissões do canal, o problema foi resolvido.

---

## Parte 8 — Testar

No canal `#fastvistos-financeiro`, manda uma mensagem. O bot deve responder.

Se não responder, verifica:
1. O bot está **online** (ponto verde) na lista de membros do servidor?
2. As permissões do canal incluem o bot com **View Channel** e **Send Messages**?
3. O gateway está rodando? (`pm2 list`)
4. Os logs mostram o bot logado? (`tail -f /tmp/openclaw/openclaw-2026-02-21.log`)

---

## Para Criar um Segundo Bot (Agente Adicional)

1. Cria uma nova aplicação no Developer Portal (repete os passos da Parte 1)
2. Cria um novo canal no Discord para esse bot
3. Roda `openclaw agents add <nome>` e seleciona **Add a new account** na etapa do Discord
4. Convida o novo bot para o servidor (repete a Parte 4)
5. Adiciona as permissões do novo bot no novo canal (repete a Parte 5)

> 💡 Cada bot precisa de uma aplicação separada no Developer Portal. Você pode ter quantos bots quiser no mesmo servidor, cada um respondendo só no seu canal.

---

## Resumo dos Problemas Encontrados

| Problema | Causa | Solução |
|---|---|---|
| Erro ao salvar no Developer Portal | Install Link não era None | Installation → Install Link → None |
| `groupId` inválido no config | Campo não existe no OpenClaw | Remover do JSON, usar apenas `channel` e `accountId` no binding |
| Conflito gateway systemd + pm2 | `doctor --repair` instalou serviço systemd | Desativar o systemd, manter só pm2 |
| Bot online mas não responde | Sem permissão de View Channel no canal | Adicionar bot nas permissões do canal com View Channel + Send Messages |
| `intents:content=limited` | Intents não estavam salvos no Developer Portal | Ativar os 3 Intents na aba Bot e salvar |
