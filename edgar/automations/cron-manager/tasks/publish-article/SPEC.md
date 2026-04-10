# Task Spec: publish-article

## Objetivo
Automatizar a publicação de artigos gerados periodicamente, enviando-os para um endpoint HTTP. A task busca o artigo mais antigo (JSON) em uma pasta configurável, extrai os dados necessários e faz o POST para publicação.

---

## Inputs
- **articles_dir** (string, obrigatório): Caminho da pasta onde estão os artigos gerados (`*.json` e `*.md`).
- **business_rules** (opcional): Mecanismo/config para alternância de business_id/blog_topic_slug por artigo.

## Fluxo
1. **Listar arquivos** em `articles_dir` com extensão `.json`.
2. **Selecionar o mais antigo** (menor data de criação/modificação).
3. **Extrair o slug** do nome do arquivo (tudo antes do `.json`).
4. **Carregar o arquivo JSON** (`[slug].json`) e o arquivo Markdown (`[slug].md`).
5. **Mapear campos** do JSON:
  - `title` → `title`
  - `seoMetaDescription` → `seo_description`
  - `content_md`: **preferencialmente usar o conteúdo do arquivo `.md`** (se existir e for legível); caso contrário, usar o campo `markdownText` do JSON como fallback. Isso garante que eventuais edições manuais ou enriquecimentos feitos após a geração sejam publicados corretamente.
  - `slug` → `slug`
  - `published` → data/hora de publicação (se existir, senão usar data do arquivo)
6. **Determinar business_id/blog_topic_slug** conforme regra de alternância (exemplo: round-robin, config, etc).
  - A task manterá um arquivo de estado (ex: `publish-article.last.json`) para persistir qual foi o último `business_id`/`blog_topic_slug` que recebeu publicação, garantindo alternância correta mesmo entre execuções diferentes.
  - Haverá um input obrigatório `destinations` (array de objetos), onde cada objeto contém `business_id` e `blog_topic_slug`. Exemplo de input:

```json
[
  { "business_id": "id1", "blog_topic_slug": "noticias-1" },
  { "business_id": "id2", "blog_topic_slug": "noticias-2" }
]
```
  - A alternância seguirá round-robin simples, sempre publicando para o próximo destino da lista e persistindo o índice no arquivo de estado.
7. **Montar payload** e enviar via HTTP POST para:
    - `http://localhost:3900/blog-article`
    - Headers: `Content-Type: application/json`, `x-api-key: ...`
8. **Marcar como publicado:**
  - Se a operação da task for bem-sucedida até o ponto de criar o artigo (POST com sucesso), os arquivos `.md` e `.json` utilizados serão movidos para o diretório `./published` dentro de `articles_dir`.
  - Caso o diretório `published` não exista, ele deve ser criado automaticamente.
  - Os arquivos serão renomeados para incluir a data do dia antes da extensão, por exemplo: `[slug]-2026-04-09.json` e `[slug]-2026-04-09.md`.
  - Por fim, a task irá tentar apagar todos os arquivos dentro de `published` que tenham data de modificação/criação igual ou superior a uma semana atrás (7 dias ou mais).

---

## Exemplo de Payload
```json
{
  "business_id": "...",
  "blog_topic_slug": "...",
  "title": "...",
  "seo_description": "...",
  "content_md": "...",
  "faq_json": [],
  "type": "public",
  "slug": "...",
  "published": "2026-04-09T12:00:00.000Z"
}
```

## Exemplo de request com curl
```bash
curl -X POST http://localhost:3900/blog-article \
  -H "Content-Type: application/json" \
  -H "x-api-key: b86189f5..." \
  -d '{
    "business_id": "3cfe8493907c488480f55c9ee10f8c05",
    "blog_topic_slug": "noticias-1",
    "title": "Título do artigo de teste 2",
    "seo_description": "Descrição SEO do artigo",
    "content_md": "Conteúdo em markdown do artigo",
    "faq_json": [],
    "type": "public",
    "slug": "titulo-do-artigo-de-teste-2",
    "published": "2026-04-09T12:00:00.000Z"
}'
```

---

## Alternância de Destino
- Implementar mecanismo simples para alternar entre múltiplos `business_id`/`blog_topic_slug`.
- Exemplo: arquivo de configuração YAML/JSON com lista de destinos e round-robin, ou função customizável.

---

## Pré-validação
- Se não houver arquivos `.json` na pasta, finalizar sem erro.
- Se faltar algum campo obrigatório, logar erro e pular arquivo.
- Se o POST falhar, logar erro e não marcar como publicado.

---

## Referências
- Estrutura de artigo JSON: ver exemplos em `artifacts/write-article/published/`.
- Endpoint de publicação: ver exemplo de curl acima.
