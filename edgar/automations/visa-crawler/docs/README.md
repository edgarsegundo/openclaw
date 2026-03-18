# visa-crawler

Robô de coleta e atualização de informações de visto internacional para cidadãos brasileiros. Usa a API do Perplexity (Sonar) para buscar dados atualizados, valida os resultados, detecta divergências entre execuções e persiste tudo em SQLite.

---

## Contexto do projeto

Este projeto foi desenvolvido como parte de um produto de informações de viagem para brasileiros. O objetivo é manter uma base de dados sempre atualizada com as regras de visto de cada país, rodando mensalmente via cron job em um VPS.

A conversa original onde o projeto foi construído está em: https://claude.ai/chat/70e232ac-111b-4709-bcd0-54375cc5c6ff

---

## Estrutura de arquivos

```
visa-crawler/
├── index.js          # Orquestrador principal — lê countries.json, itera países, grava runs
├── crawler.js        # Lógica de coleta de um único país (consultas, validação, persistência)
├── compare.js        # Comparação de snapshots e desempate via Sonar
├── db.js             # Todas as operações SQLite (abertura, schema, queries)
├── validate.js       # Validação e auto-correção do JSON retornado pelo Sonar
├── revalidate.js     # Segundo request cirúrgico para campos com dúvida
├── healthcheck.js    # Verificação de URLs dos recursos (HEAD requests)
├── logger.js         # Winston com daily rotate
├── discord.js        # Notificações via webhook do Discord
├── countries.json    # Lista de países a monitorar
├── package.json
├── .env.example
└── logs/             # Criado automaticamente pelo Winston
```

---

## Variáveis de ambiente

```env
PERPLEXITY_API_KEY=     # Chave da API do Perplexity
DISCORD_WEBHOOK_URL=    # Webhook para notificações (opcional)
HEALTHCHECK=true        # false para desabilitar verificação de URLs
RATE_LIMIT_MS=2000      # Pausa entre países em ms (padrão: 2000)
```

---

## Como rodar

```bash
npm install
node index.js
```

Cron mensal no VPS:

```
0 6 1 * * cd /path/to/visa-crawler && node index.js >> /var/log/visa-crawler-cron.log 2>&1
```

---

## Fluxo de execução

Para cada país em `countries.json`:

```
1. Consulta principal (Sonar)        → todos os campos de visto
        ↓
2. Consulta de recursos (Sonar)      → artigos, vídeos, fóruns, tutoriais
        ↓
3. Merge dos dois resultados
        ↓
4. validate.js                       → valida estrutura, tipos, coerência semântica
        ↓
5. revalidate.js (se dúvidas)        → segundo request apenas para campos problemáticos
        ↓
6. healthcheck.js (se habilitado)    → verifica URLs dos recursos via HEAD
        ↓
7. compare.js                        → compara com snapshot anterior
        ↓
   divergência nos campos críticos?
   ├─ Não → salva snapshot com status "atual"
   └─ Sim → salva snapshot com status "divergente"
              + dispara desempate via Sonar
              + grava resultado em desempates
              + notifica Discord
```

---

## Banco de dados (SQLite)

Arquivo: `visa-crawler.db`

### Tabela `paises`

Catálogo dos países monitorados. `ativo = 0` pausa um país sem deletar o histórico.

| Campo      | Tipo    | Descrição                          |
| ---------- | ------- | ---------------------------------- |
| id         | TEXT PK | Slug do país (ex: "eua", "franca") |
| nome       | TEXT    | Nome completo em português         |
| codigo_iso | TEXT    | Código ISO 3166-1 alpha-2          |
| ativo      | INTEGER | 1 = ativo, 0 = pausado             |

### Tabela `visa_snapshots`

Um registro por execução mensal por país. Guarda o JSON completo e desnormaliza os campos críticos para comparação direta via SQL.

| Campo                   | Tipo       | Descrição                               |
| ----------------------- | ---------- | --------------------------------------- |
| id                      | INTEGER PK |                                         |
| pais_id                 | TEXT FK    |                                         |
| coletado_em             | DATE       | Data da coleta                          |
| schema_versao           | INTEGER    | Versão do schema da IA (atualmente: 1)  |
| status                  | TEXT       | "atual", "divergente" ou "arquivado"    |
| type_label              | TEXT       | Campo crítico desnormalizado            |
| custo                   | TEXT       | Campo crítico desnormalizado            |
| entrevista              | INTEGER    | Campo crítico desnormalizado (0/1/null) |
| validade_min_passaporte | TEXT       | Campo crítico desnormalizado            |
| seguro_saude            | INTEGER    | Campo crítico desnormalizado (0/1/null) |
| confiabilidade          | TEXT       | "alta", "média" ou "baixa"              |
| json_completo           | TEXT       | JSON completo retornado pelo Sonar      |

### Tabela `desempates`

Criada apenas quando dois snapshots consecutivos divergem num campo crítico. O resultado do terceiro request de desempate fica aqui — o snapshot original não é modificado.

| Campo           | Tipo       | Descrição                               |
| --------------- | ---------- | --------------------------------------- |
| snapshot_id     | INTEGER FK | Snapshot que gerou a divergência        |
| pais_id         | TEXT FK    |                                         |
| campo           | TEXT       | Nome do campo divergente                |
| valor_anterior  | TEXT       | Valor do snapshot anterior              |
| valor_novo      | TEXT       | Valor do snapshot novo                  |
| valor_resolvido | TEXT       | Resultado do desempate (null se falhou) |
| confianca       | TEXT       | "alta", "média", "baixa" ou "falhou"    |

### Tabela `runs`

Um registro por execução do crawler (todos os países).

| Campo        | Tipo    | Descrição                                   |
| ------------ | ------- | ------------------------------------------- |
| status       | TEXT    | "running", "success", "partial" ou "failed" |
| total        | INTEGER | Total de países processados                 |
| sucesso      | INTEGER | Países sem erro                             |
| divergencias | INTEGER | Países com divergência detectada            |
| erros        | INTEGER | Países que falharam                         |

### Tabela `schema_changelog`

Registro de versões do schema da IA. Incrementar `SCHEMA_VERSAO` em `db.js` quando o schema do JSON mudar de forma incompatível.

---

## Schema do JSON retornado pelo Sonar

Versão atual: `1`

```json
{
  "typeLabel": "string | null",
  "visaName": "string | null",
  "prazo": "string | null",
  "tempoAntecedencia": "string | null",
  "validade": "string | null",
  "estadia": "string | null",
  "custo": "string | null",
  "solicitacao": "string | null",
  "entrevista": "boolean | null",
  "seguroSaude": "boolean | null",
  "comprovanteRetorno": "boolean | null",
  "validadeMinPassaporte": "string | null",
  "confiabilidade": "alta | média | baixa",
  "documentos": "string[]",
  "vacinas": "string[]",
  "consulados": "[{ cidade: string, site: string }] | null",
  "recursos": "[{ titulo: string, url: string, tipo: string }] | null",
  "observacoes": "string | null",
  "fonte": "string[]",
  "atualizadoEm": "YYYY-MM-DD"
}
```

**Campos críticos** (disparam desempate quando divergem entre snapshots):

- `custo`
- `entrevista`
- `validadeMinPassaporte`
- `seguroSaude`

---

## Modelo Sonar

- **Consulta principal e recursos:** `sonar` (padrão)
- **Desempate:** `sonar` (padrão)
- Considerar `sonar-pro` para países com `confiabilidade: "baixa"` e `recursos` escassos — ~10x mais caro por token mas resultados melhores para países com informações escassas

---

## Custo estimado

| Cenário                  | Custo/país | 100 países |
| ------------------------ | ---------- | ---------- |
| Sonar normal             | ~$0.006    | ~$0.60     |
| Sonar normal + desempate | ~$0.012    | ~$1.20     |
| Sonar Pro                | ~$0.05     | ~$5.00     |

---

## Validações automáticas (validate.js)

O módulo detecta e auto-corrige antes de persistir:

- **Booleanos como string** → converte para boolean
- **Arrays null** → converte `vacinas` e `documentos` para `[]`
- **Fontes com marcadores de citação** → remove `[4] ` do início das URLs
- **Recursos marcados como "oficial"** → rebaixa para "artigo" se a URL não for de domínio governamental
- **Coerência semântica** → ex: `entrevista: true` sem `consulados` gera dúvida para revalidação

---

## countries.json

Formato esperado:

```json
[
  { "id": "eua", "nome": "Estados Unidos", "codigo_iso": "US" },
  { "id": "australia", "nome": "Austrália", "codigo_iso": "AU" }
]
```

O `id` é usado como chave primária em `paises`. Uma vez definido, não altere — mudá-lo quebraria o histórico de snapshots.

---

## Próximos passos sugeridos

- [ ] Implementar frequência adaptativa por país (países voláteis → ciclo menor)
- [ ] Endpoint ou script de leitura para consumir os dados do banco no frontend
- [ ] Suporte a `finalidade` da viagem além de turismo (negócios, estudo)
- [ ] Considerar `sonar-pro` seletivo para países com `confiabilidade: "baixa"`
- [ ] Adicionar `type_code` como campo desnormalizado se filtros no frontend forem necessários
