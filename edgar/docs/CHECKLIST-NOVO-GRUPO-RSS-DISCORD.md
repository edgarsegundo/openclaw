# ✅ Checklist — novo grupo (canal Discord → RSS → artigo publicado)

## 🎯 Objetivo

Guia reutilizável para toda vez que você quiser criar um novo "grupo" de
notícias: canal no Discord, captura de feeds, triagem por IA, comandos
`.apr`/`.del`/`.l1`/`.l2`/`.pub` e publicação de artigo no site final.

Use `<slug>` como o identificador do grupo em tudo (ex: `emprego-campinas`).
Para os passos de UI do Discord (criar canal, permissão, webhook), veja
primeiro [DISCORD.novo-canal-mesmo-bot.md](./DISCORD.novo-canal-mesmo-bot.md) —
este documento cobre a parte que liga esse canal aos tasks do `cron-manager`
e ao CMS.

---

## 🔑 Regra de ouro

```text
nome do canal no Discord (#slug)  ==  "group" nos inputs  ==  sufixo de TODOS os
inputs-<slug>.json (rss-fetcher, rss-picker, write-article, publish-article)
```

Isso é forçado pelo código, não é convenção — cada comando do Discord resolve
o arquivo de input a partir do **nome literal do canal**:

- [`commands/apr.js`](../channels/discord/commands/apr.js), [`del.js`](../channels/discord/commands/del.js), [`l1.js`](../channels/discord/commands/l1.js) → `inputs-${channelName}.json` em `tasks/rss-picker/inputs/`
- [`commands/l2.js`](../channels/discord/commands/l2.js), [`pub.js`](../channels/discord/commands/pub.js) → `inputs-${channelName}.json` em `tasks/publish-article/inputs/`

Se o canal se chama `#emprego-campinas`, o slug é `emprego-campinas` em
**todos** os arquivos — sem maiúsculas, sem `#`, com `-`.

---

## 🗺️ Visão geral do pipeline

```
[externo, uma vez por site]
  microservicesadm (Django) → cria o "business" (business_id) e o "blog topic"
  (blog_topic_slug) daquele site
  multi-sites/sites/<site_id>/ (repo fastvistos) → site já implantado, com
  site-config.ts referenciando o mesmo business_id + domínio

[por grupo/canal, dentro do openclaw]
Discord (#slug) ── bots.config.js autoriza o bot a ouvir esse canal
   ▼
rss-fetcher   (feeds-<slug>.js + inputs/inputs-<slug>.json)
   │ produz artifacts/rss-fetcher/fetched-items-<slug>-<data>.json
   ▼
rss-picker    (inputs/inputs-<slug>.json)
   │ itens novos >= min_items → Sonar (IA) julga e aprova/rejeita
   │ itens novos <  min_items → só posta no Discord webhook, sem IA
   │ produz approved-<slug>-<data>.json
   ▼
canal: .l1 (listar) / .apr <i> (aprovar manual) / .del <i> (rejeitar manual)
   ▼
write-article (inputs/inputs-<slug>.json)
   │ lê approved-<slug>-<data>.json, pesquisa (Sonar Pro) e escreve o artigo
   │ produz artifacts/write-article/<slug>/*.json + *.md
   ▼
canal: .l2 (listar artigos prontos) / .pub <site_id> (publicar + indexar)
   ▼
publish-article (inputs/inputs-<slug>.json → "destinations": [...])
   │ POST /blog-article no msitesapp (precisa blog_topic_slug já existir)
   │ POST /execute-publish-script <site_id> → deploy do site
   ▼
site publicado + indexação no Google
```

---

## ✅ Parte A — pré-requisitos externos (uma vez por _site_, não por canal)

Feito **antes** de qualquer arquivo no `openclaw`. Só repete se o site de
destino ainda não existir.

### A1) Cadastrar o negócio no `microservicesadm`

App Django separado, já em produção (fora do repo `openclaw`). Lá se cria:

- o **business** → gera um `business_id` (UUID)
- o **blog topic** → define o `blog_topic_slug` usado nas publicações

Anote os dois — são usados no `publish-article` (Parte B, passo 9). Sem o
blog topic já criado, a publicação falha com 404 ("Blog topic não
encontrado"): o endpoint `POST /blog-article`
([`publish-routes.js:34-37`](/Users/edgar/Repos/fastvistos/multi-sites/core/msitesapp/api/publish-routes.js#L34-L37))
só busca um topic existente, **não cria** um novo.

### A2) Site implantado em `multi-sites/sites/<site_id>/`

No repo `fastvistos/multi-sites`, o site precisa existir em
`sites/<site_id>/` com um `site-config.ts` referenciando o **mesmo**
`business_id` do passo A1 e o domínio certo. Exemplo real (`sites/emprego/`):

```ts
business_id: '47f72bb76ec74a078337e38f54ebc213',  // mesmo UUID de A1, sem os hífens
domain: 'empregoaqui.com.br',
```

`site_id` (usado no `.pub <site_id>` e no script de deploy
`publish-from-vps-v2.sh <site_id>`) é o nome dessa pasta.

---

## ✅ Parte B — passos dentro do `openclaw` (por canal/grupo)

### 1) Escolher o `<slug>`

`kebab-case`, minúsculo, sem espaço. Vira `"group"` em todo input e o nome
do canal.

### 2) Discord — criar canal + webhook

Siga [DISCORD.novo-canal-mesmo-bot.md](./DISCORD.novo-canal-mesmo-bot.md):
criar canal `#<slug>`, dar permissão ao bot, criar o webhook do canal, copiar
o **Channel ID**.

⚠️ Esse webhook vai para `rss-picker` (passo 5) e `publish-article` (passo 9) — **não** para `rss-fetcher` (passo 4 ignora esse campo).

### 3) `bots.config.js` — autorizar o bot a ouvir o canal

Editar [`edgar/channels/discord/bots.config.js`](../channels/discord/bots.config.js):

```js
const NOVO_SLUG_CHANNEL_ID = "..."; // Channel ID do passo 2

export default [
  {
    name: "FASTVISTOSARTICLES",
    token: process.env.FASTVISTOS_BOT_TOKEN,
    channels: [/* ...existentes..., */ NOVO_SLUG_CHANNEL_ID],
  },
];
```

Sem estar em `channels: [...]`, o bot recebe a mensagem e descarta
silenciosamente ([`index.js`](../channels/discord/index.js), checagem
`channels.includes(message.channel.id)`).

⚠️ **`node --check edgar/channels/discord/bots.config.js` antes de reiniciar.**
Um erro de sintaxe aqui derruba o bot inteiro no boot (todos os canais, não
só o novo) e o pm2 fica reiniciando em loop sem processar nada. Depois de
editar, sempre `pm2 restart discord-bot` — não há hot-reload.

### 4) `rss-fetcher` — feeds + input

- `tasks/rss-fetcher/feeds-<slug>.js` exportando `DEFAULT_FEEDS` e
  `parseCustomFeeds` (contrato em
  [`prompt-para-criar-feed-file.md`](../automations/cron-manager/tasks/rss-fetcher/prompt-para-criar-feed-file.md)).
- `tasks/rss-fetcher/inputs/inputs-<slug>.json`:

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

`discord_webhook_url` aqui não é lido pelo código — deixe vazio.

### 5) `rss-picker` — input com o webhook de verdade

`tasks/rss-picker/inputs/inputs-<slug>.json`:

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

- `discord_webhook_url` **é lido aqui**
  ([`index.js:42`](../automations/cron-manager/tasks/rss-picker/index.js#L42)).
- `min_items`: quantos itens novos precisam se acumular pra chamar o Sonar
  (IA). Abaixo disso, só notifica o Discord sem gastar com IA
  ([`index.js:211`](../automations/cron-manager/tasks/rss-picker/index.js#L211)).
  Truque pra testar o fetcher sem acionar IA: `min_items` bem alto (ex:
  `999`) e voltar pro valor normal depois.
- Nome do arquivo precisa bater com o nome do canal — é o que
  `.apr`/`.del`/`.l1` procuram.

### 6) `run-<slug>.sh` (rss-fetcher + rss-picker) + cron

Copiar um `run-*.sh` existente (ex:
[`run-visto-americano.sh`](../automations/cron-manager/tasks/rss-fetcher/run-visto-americano.sh)),
trocar lock/log/inputs para `<slug>`. Ele roda `rss-fetcher` e, em seguida,
`rss-picker`. Cron:

```cron
0 8,12,16,22 * * 1-6 flock -n /tmp/rss-fetcher-<slug>.lock timeout 25m /home/ubuntu/openclaw/edgar/automations/cron-manager/tasks/rss-fetcher/run-<slug>.sh >> /tmp/rss-fetcher-<slug>.log 2>&1
```

### 7) Testar `.l1` / `.apr` / `.del` no canal

No canal `#<slug>` (bot já reiniciado): `.l1` lista pendentes, `.apr <i>`
aprova, `.del <i>` rejeita. Se nada responder, confira nessa ordem: bot de pé
(`pm2 logs discord-bot --err`, sem `SyntaxError`) → canal em
`channels: [...]` → `inputs-<slug>.json` existe em
`tasks/rss-picker/inputs/` → nome do arquivo bate com `message.channel.name`.

### 8) `write-article` — gera o texto do artigo

⚠️ **Passo fácil de esquecer** — sem ele, `.apr` só marca o item como
aprovado, mas nenhum artigo é escrito.

`tasks/write-article/inputs/inputs-<slug>.json`:

```json
{
  "group": "<slug>",
  "rss_picker_file_pattern": "approved-{group}-{date}.json",
  "current_approved_list_path": "artifacts/rss-picker",
  "output_dir": "artifacts/write-article",
  "language": "pt-BR",
  "blog_context": "mesmo texto usado no rss-picker, pra manter o tom consistente"
}
```

E adicionar uma linha em
[`tasks/write-article/run-write-article.sh`](../automations/cron-manager/tasks/write-article/run-write-article.sh)
(esse script é compartilhado, roda um `node cron-manager.js run
write-article ...` por grupo — lista hardcoded, precisa adicionar o novo
grupo manualmente):

```bash
node cron-manager.js run write-article --template news --input-file tasks/write-article/inputs/inputs-<slug>.json
```

Produz `artifacts/write-article/<slug>/*.json` + `*.md` — é o `articles_dir`
que o `publish-article` (próximo passo) vai ler.

### 9) `publish-article` (`.l2` / `.pub <site_id>`)

`tasks/publish-article/inputs/inputs-<slug>.json`:

```json
{
  "group": "<slug>",
  "articles_dir": "./artifacts/write-article/<slug>",
  "destinations": [
    {
      "business_id": "uuid do passo A1, com hífens",
      "site_id": "nome da pasta em multi-sites/sites/ (passo A2)",
      "blog_topic_slug": "slug do blog topic do passo A1",
      "label": "Nome legível",
      "sitemap_url": "https://dominio-do-site.com.br/sitemap-index.xml"
    }
  ],
  "discord_webhook_url": "https://discord.com/api/webhooks/.../..."
}
```

Exemplo real (`emprego-campinas`, site EmpregoAqui):

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
  ],
  "discord_webhook_url": "https://discord.com/api/webhooks/.../..."
}
```

No canal: `.l2` lista os artigos prontos para publicar; `.pub <site_id>`
publica todos os artigos `saved` daquele `site_id` e dispara o deploy
(`execute-publish-script`).

### 9b) `run-publish-article.sh` — adicionar o grupo ao cron automático

⚠️ **Passo fácil de esquecer** — sem ele, o `.l2`/`.pub` manuais funcionam,
mas o grupo **nunca** publica sozinho e **nunca** posta a lista diária
(`📰 Artigos do dia`) no canal.

Igual ao `run-write-article.sh` (passo 8),
[`tasks/publish-article/run-publish-article.sh`](../automations/cron-manager/tasks/publish-article/run-publish-article.sh)
é um script **compartilhado com lista hardcoded de grupos**. Ele roda a Parte 1
do `publish-article` para cada grupo: pega o artigo mais antigo ainda não
publicado, faz `POST /blog-article`, move para `published/`, registra no
`status-<data>.json` e então envia a lista do dia para o webhook do Discord
([`index.js` Parte 1](../automations/cron-manager/tasks/publish-article/index.js)).
Sem a linha do grupo aqui, nada disso acontece.

```bash
node cron-manager.js run publish-article --template skip --input-file tasks/publish-article/inputs/inputs-<slug>.json
```

---

## 🧠 Pegadinhas conhecidas

- `discord_webhook_url` só é lido pelo **rss-picker** e pelo
  **publish-article** — nunca pelo rss-fetcher. Configurar lá não faz nada.
- `blog_topic_slug` precisa **já existir** no CMS (criado no A1) — o
  `POST /blog-article` não cria um novo, só busca; se não achar, publica com
  404 "Blog topic não encontrado".
- `write-article` é o passo mais fácil de esquecer: sem o
  `inputs-<slug>.json` dele (e sem adicionar a linha no
  `run-write-article.sh`), `.apr` funciona, mas nenhum artigo é gerado.
- `run-write-article.sh`, `run-publish-article.sh` (e o `run-*.sh` do
  rss-fetcher/rss-picker) são scripts compartilhados com lista hardcoded de
  grupos — sempre confirmar que o novo grupo foi adicionado em **todos** eles,
  não só que os `inputs-*.json` existem. Esquecer o `run-publish-article.sh` é
  silencioso: os comandos manuais `.l2`/`.pub` continuam funcionando, mas o
  grupo nunca publica no cron nem posta a lista diária no Discord.
- `min_items` alto (ex: `999`) = forma de testar o fetcher sem gastar com
  Sonar.
- Nome do canal: sem `#`, com `-`, minúsculo, idêntico ao `<slug>` usado nos
  `inputs-<slug>.json`.
- `bots.config.js` é sensível a sintaxe — um erro aí derruba o bot inteiro.
  Sempre `node --check` antes de reiniciar o pm2, e sempre reiniciar depois
  de editar `bots.config.js`/`commands/*.js` (sem hot-reload).
- Pré-requisitos externos (Parte A) moram em **outros repos** que o
  `openclaw` não controla: `microservicesadm` (Django, business + blog
  topic) e `multi-sites/sites/<site_id>/` (repo `fastvistos`, site
  implantado). Sem os dois prontos, os passos 8–9 falham mesmo com tudo
  certo no `openclaw`.
