# Gerenciando países — countries.js

O `countries.js` é o script CLI para gerenciar quais países o visa-crawler vai monitorar. Todas as alterações são feitas aqui — nunca diretamente no banco.

---

## Como funciona

O arquivo `countries-data.json` contém todos os países do mundo com seus nomes em português e códigos ISO. O `countries.js` usa esse arquivo como referência para adicionar países ao banco de dados (`visa-crawler.db`), onde o crawler vai buscar a lista de países ativos a cada execução.

---

## Comandos

### Adicionar um país

```bash
node countries.js add <ISO>
```

```bash
node countries.js add PT
# ✓ Portugal (PT) adicionado
```

---

### Adicionar vários países de uma vez

Separe os códigos ISO por vírgula, sem espaço:

```bash
node countries.js add PT,US,AU,JP,FR,DE,IT,ES
# ✓ Portugal (PT) adicionado
# ✓ Estados Unidos (US) adicionado
# ✓ Austrália (AU) adicionado
# ✓ Japão (JP) adicionado
# ✓ França (FR) adicionado
# ✓ Alemanha (DE) adicionado
# ✓ Itália (IT) adicionado
# ✓ Espanha (ES) adicionado
#
#   8 adicionado(s)
```

---

### Listar países ativos

```bash
node countries.js list
```

```
  ISO   Nome
  ───   ────
  AU    Austrália
  DE    Alemanha
  ES    Espanha
  FR    França
  IT    Itália
  JP    Japão
  PT    Portugal
  US    Estados Unidos

  Total: 8 país(es)
```

---

### Remover um país

Remove o país da lista de ativos. O histórico de snapshots é **preservado** — nada é deletado do banco.

```bash
node countries.js remove JP
# ✓ Japão (JP) desativado. Histórico preservado.
```

Se quiser reativar depois:

```bash
node countries.js add JP
# ✓ Japão (JP) adicionado
```

---

### Ver ajuda

```bash
node countries.js
```

---

## Códigos ISO

Os códigos seguem o padrão **ISO 3166-1 alpha-2** — sempre duas letras maiúsculas. Exemplos:

| País           | ISO |
| -------------- | --- |
| Brasil         | BR  |
| Estados Unidos | US  |
| Portugal       | PT  |
| França         | FR  |
| Alemanha       | DE  |
| Japão          | JP  |
| Austrália      | AU  |
| Argentina      | AR  |
| Reino Unido    | GB  |
| China          | CN  |
| Índia          | IN  |
| México         | MX  |

A lista completa está em `countries-data.json` — são 195 países.

---

## Comportamentos importantes

**Adicionar um país já existente** é seguro — o comando faz upsert, então não duplica nem gera erro. Útil para reativar um país que foi removido.

```bash
node countries.js add PT
# ✓ Portugal (PT) adicionado  ← reativado se estava inativo
```

**ISO inválido** — se o código não existir em `countries-data.json`, o script avisa e pula:

```bash
node countries.js add XX
# ✗ "XX" não encontrado em countries-data.json
```

**Mistura de válidos e inválidos** — processa os válidos e reporta os inválidos:

```bash
node countries.js add PT,XX,AU
# ✓ Portugal (PT) adicionado
# ✗ "XX" não encontrado em countries-data.json
# ✓ Austrália (AU) adicionado
#
#   2 adicionado(s), 1 não encontrado(s)
```

**ISO é case-insensitive** — `pt`, `PT` e `Pt` funcionam igual:

```bash
node countries.js add pt
# ✓ Portugal (PT) adicionado
```

---

## Fluxo recomendado

```bash
# 1. adicionar os países que quer monitorar
node countries.js add PT,US,AU,JP,FR,DE,AR,MX,GB,IT

# 2. conferir a lista
node countries.js list

# 3. rodar o crawler
node index.js

# 4. se quiser pausar um país sem perder o histórico
node countries.js remove KP

# 5. reativar quando quiser
node countries.js add KP
```
