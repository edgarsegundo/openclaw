# ✅ Checklist — novo grupo (canal Discord → RSS → artigo)

## 🎯 Objetivo

Ligar um novo "grupo" (ex: `emprego-campinas`) ponta a ponta: canal no Discord,
captura de feeds, triagem por IA, comandos `.apr`/`.del`/`.l1`/`.l2`/`.pub` e,
por fim, publicação no CMS.

Para os passos de UI do Discord (criar canal, dar permissão, gerar webhook),
veja primeiro [DISCORD.novo-canal-mesmo-bot.md](./DISCORD.novo-canal-mesmo-bot.md).
Este documento cobre a parte que falta: como ligar esse canal aos tasks do
`cron-manager`.

---

## 🔑 Regra de ouro

```text
nome do canal no Discord (#slug)  ==  "group" nos inputs  ==  sufixo de TODOS os
inputs-<slug>.json (rss-fetcher, rss-picker, publish-article)
```

Isso é forçado pelo código, não é convenção — cada comando resolve o arquivo de
input a partir do **nome literal do canal**:

- [`commands/apr.js`](../channels/discord/commands/apr.js) → `inputs-${channelName}.json` em `tasks/rss-picker/inputs/`
- [`commands/del.js`](../channels/discord/commands/del.js) → idem
- [`commands/l1.js`](../channels/discord/commands/l1.js) → idem
- [`commands/l2.js`](../channels/discord/commands/l2.js) → `inputs-${channelName}.json` em `tasks/publish-article/inputs/`
- [`commands/pub.js`](../channels/discord/commands/pub.js) → idem

Se o canal se chama `#emprego-campinas`, o slug tem que ser `emprego-campinas`
em **todos** os arquivos abaixo — sem maiúsculas, sem `#`, com `-`.

---

## 🗺️ Visão geral do pipeline

```
Discord (#slug)
   │
   ├─ bots.config.js → autoriza o bot a ouvir esse canal
   │
   ▼
rss-fetcher  (feeds-<slug>.js + inputs/inputs-<slug>.json)
   │  produz artifacts/rss-fetcher/fetched-items-<slug>-<data>.json
   ▼
rss-picker   (inputs/inputs-<slug>.json)
   │  se itens novos >= min_items → chama Sonar (IA) e aprova/rejeita
   │  se < min_items → só posta no Discord webhook, sem IA
   │  produz approved-<slug>-<data>.json
   ▼
comandos no canal: .apr <i> / .del <i> / .l1        (rss-picker)
   │
   ▼
write-article (gera o texto)  →  approved vira artigo salvo
   │
   ▼
comandos no canal: .l2 / .pub <site_id>             (publish-article)
   │  precisa de inputs/inputs-<slug>.json com "destinations": [...]
   │  cada destino precisa de business_id + site_id já cadastrados no CMS
   ▼
CMS msitesapp → publica e indexa no Google
```

---

## ✅ Passo a passo

### 1) Escolher o slug

`kebab-case`, minúsculo, sem espaço. Ex: `emprego-campinas`.
Esse slug é o `"group"` em todo input e também o nome do canal.

### 2) Discord — criar canal + webhook

Siga [DISCORD.novo-canal-mesmo-bot.md](./DISCORD.novo-canal-mesmo-bot.md):
criar canal `#<slug>` (sem `#`, com `-`), dar permissão ao bot, criar o
webhook do canal, copiar o **Channel ID**.

⚠️ O webhook criado aqui vai para o `rss-picker` (passo 5), **não** para o
`rss-fetcher` — o fetcher nunca lê `discord_webhook_url`.

### 3) `bots.config.js` — autorizar o bot a ouvir o canal

Editar [`edgar/channels/discord/bots.config.js`](../channels/discord/bots.config.js):

```js
const EMPREGOS_CAMPINAS_CHANNEL_ID = "1522056415102107729"; // Channel ID do passo 2

export default [
  {
    name: "FASTVISTOSARTICLES",
    token: process.env.FASTVISTOS_BOT_TOKEN,
    channels: [VISTO_AMERICANO_CHANNEL_ID, DISNEY_ORLANDO_CHANNEL_ID, EMPREGOS_CAMPINAS_CHANNEL_ID],
  },
];
```

Se o canal não estiver em `channels: [...]`, o bot recebe a mensagem mas
descarta silenciosamente (`if (channels && !channels.includes(message.channel.id)) return;`
em [`index.js`](../channels/discord/index.js)).

⚠️ **Reiniciar o bot depois de editar este arquivo** (`pm2 restart discord-bot`
no servidor). Sem restart, a mudança não é lida.

⚠️ **Cuidado com sintaxe.** Esse arquivo é `export default [...]` (ESM, por
causa do `"type": "module"` no `package.json` do bot). Qualquer erro de
sintaxe aqui derruba o bot inteiro no boot — e o pm2 fica reiniciando em loop
sem processar **nenhum** comando, em **nenhum** canal, não só o novo. Se
`.apr`/`.pub`/etc pararem de responder do nada, o primeiro lugar a olhar é
`pm2 logs discord-bot --err` procurando `SyntaxError`.

### 4) `rss-fetcher` — feeds + input

- Criar `tasks/rss-fetcher/feeds-<slug>.js` exportando `DEFAULT_FEEDS` e
  `parseCustomFeeds` (contrato descrito em
  [`prompt-para-criar-feed-file.md`](../automations/cron-manager/tasks/rss-fetcher/prompt-para-criar-feed-file.md)).
- Criar `tasks/rss-fetcher/inputs/inputs-<slug>.json`:

```json
{
  "group": "<slug>",
  "language": "pt",
  "topic": "...",
  "patterns": "...",
  "exclude_patterns": "...",
  "feeds": "",
  "max_items": 30,
  "feeds_js_file": "feeds-<slug>.js",
  "discord_webhook_url": ""
}
```

`discord_webhook_url` aqui é ignorado pelo código — pode deixar vazio. `group`
é o que nomeia o artifact (`fetched-items-<slug>-<data>.json`), não precisa
bater com o nome do canal por código, mas mantenha igual ao slug por
consistência.

### 5) `rss-picker` — input com o webhook de verdade

Criar `tasks/rss-picker/inputs/inputs-<slug>.json`:

```json
{
  "group": "<slug>",
  "rss_fetcher_output_artifact_file_name_pattern": "artifacts/rss-fetcher/fetched-items-{group}-{date}.json",
  "blog_context": "descrição do blog/público — usada pela IA pra julgar relevância",
  "min_items": 10,
  "min_score": 6,
  "discord_webhook_url": "https://discord.com/api/webhooks/.../..."
}
```

- `discord_webhook_url` **é lido aqui** ([`tasks/rss-picker/index.js:42`](../automations/cron-manager/tasks/rss-picker/index.js#L42)) — é este arquivo que precisa do webhook do passo 2.
- `min_items`: quantos itens novos (não vistos ainda) precisam se acumular
  para disparar a triagem por IA (Sonar/Perplexity). Abaixo disso, só
  notifica o Discord com a lista crua, sem gastar com IA
  ([`index.js:211`](../automations/cron-manager/tasks/rss-picker/index.js#L211)).
  Truque pra testar o fetcher sem acionar IA: setar `min_items` bem alto
  (ex: `999`) temporariamente.
- **O nome deste arquivo (`inputs-<slug>.json`) precisa bater com o nome do
  canal** — é o que os comandos `.apr`/`.del`/`.l1` procuram.

### 6) `run-<slug>.sh` + cron

Copiar um `run-*.sh` existente (ex:
[`run-visto-americano.sh`](../automations/cron-manager/tasks/rss-fetcher/run-visto-americano.sh)),
trocar os nomes de lock/log/inputs para `<slug>`. Ele roda `rss-fetcher` e em
seguida `rss-picker` em sequência. Agendar no cron do servidor:

```cron
0 8,12,16,22 * * 1-6 flock -n /tmp/rss-fetcher-<slug>.lock timeout 25m /home/ubuntu/openclaw/edgar/automations/cron-manager/tasks/rss-fetcher/run-<slug>.sh >> /tmp/rss-fetcher-<slug>.log 2>&1
```

### 7) Testar os comandos no canal

No canal `#<slug>` do Discord (bot já reiniciado, passo 3):

- `.l1` → lista os itens pendentes do dia (lê `rss-picker`)
- `.apr <i>` → aprova o item de índice `i`
- `.del <i>` → remove o item de índice `i`

Se não responder nada: confira (nessa ordem) — bot está de pé (`pm2 logs`
sem `SyntaxError`) → canal está em `channels: [...]` no `bots.config.js` →
`inputs-<slug>.json` existe em `tasks/rss-picker/inputs/` → nome do arquivo
bate exatamente com `message.channel.name`.

### 8) `publish-article` (`.l2` / `.pub <site_id>`) — opcional, quando o site já existir

Criar `tasks/publish-article/inputs/inputs-<slug>.json`:

```json
{
  "group": "<slug>",
  "articles_dir": "./artifacts/write-article/<slug>",
  "destinations": [
    {
      "business_id": "uuid-do-negócio-no-cms",
      "site_id": "slug-curto-do-site-no-deploy",
      "blog_topic_slug": "topico-do-blog-no-cms",
      "label": "Nome legível",
      "sitemap_url": "https://dominio-do-site.com.br/sitemap-index.xml"
    }
  ],
  "discord_webhook_url": "https://discord.com/api/webhooks/.../..."
}
```

Exemplo real (grupo `emprego-campinas`, site EmpregoAqui):

```json
{
  "group": "emprego-campinas",
  "articles_dir": "./artifacts/write-article/emprego-campinas",
  "destinations": [
    {
      "business_id": "47f72bb7-6ec7-4a07-8337-e38f54ebc213",
      "site_id": "emprego",
      "blog_topic_slug": "noticias-do-mundo-do-trabalho",
      "label": "Emprego Aqui",
      "sitemap_url": "https://empregoaqui.com.br/sitemap-index.xml"
    }
  ]
}
```

`business_id` e `site_id` precisam **já existir previamente** no CMS
multi-tenant (`msitesapp`, repo `fastvistos/multi-sites`) — é o mesmo
cadastro que já existe pra `fastvistos` e `centraldevistos`.

O cadastro do `business_id` é feito num app Django separado, já em produção,
chamado **`microservicesadm`** (fora do repo `openclaw`). É lá que se cria o
"negócio" (business) antes de usar `.pub`/`.l2` para ele. `business_id` é
depois validado via `BlogService` (`dist/lib/blog-service.js` no
`msitesapp`), e `site_id` é passado pro script de deploy
`publish-from-vps-v2.sh <site_id>` — esse site também precisa estar
implantado nesse sistema.

Exemplo já cadastrado:

```text
business_id: 47f72bb7-6ec7-4a07-8337-e38f54ebc213   (negócio "emprego" no microservicesadm)
```

---

## 🧠 Pegadinhas conhecidas

- `discord_webhook_url` só é lido pelo **rss-picker** e pelo
  **publish-article** — nunca pelo rss-fetcher. Configurar lá não faz nada.
- `min_items` alto == forma de testar o fetcher sem gastar com Sonar.
- Nome do canal: sem `#`, com `-`, tudo minúsculo, idêntico ao `<slug>` usado
  nos nomes de arquivo `inputs-<slug>.json`.
- Editar `bots.config.js` é sensível a sintaxe — um erro aí derruba o bot
  inteiro (todos os canais, não só o novo). Sempre `node --check
edgar/channels/discord/bots.config.js` antes de reiniciar o pm2.
- Depois de editar `bots.config.js` ou qualquer arquivo em `commands/`,
  reiniciar o processo (`pm2 restart discord-bot`) — não há hot-reload.
