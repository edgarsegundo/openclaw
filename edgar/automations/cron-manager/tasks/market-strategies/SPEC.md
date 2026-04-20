https://chatgpt.com/c/69e619da-c944-83e9-96ec-3deaff2af911

Aqui está uma **SPEC em `.md` pronta** para o seu projeto **`market-strategies`**, seguindo o padrão dos READMEs que você enviou (task-based + cron-manager + desacoplamento + plugins):

---

```md
# SPEC — market-strategies

## Framework de estratégias de mercado baseado em tasks desacopladas

---

# 1. Objetivo

O **market-strategies** é um framework para execução de múltiplas estratégias de mercado de forma desacoplada, reutilizável e extensível.

Ele permite:

- criar estratégias independentes (plugins);
- executar várias estratégias sobre o mesmo dataset;
- integrar com o cron-manager como tasks;
- gerar sinais (signals) como artifacts;
- comparar e evoluir estratégias ao longo do tempo.

---

# 2. Filosofia

- Cada estratégia é **isolada**
- O core nunca conhece a lógica interna da estratégia
- Estratégias são **plugáveis**
- Execução é **stateless (one-shot)** via cron-manager
- Output é sempre estruturado (artifact)

---

# 3. Arquitetura geral

```

market-strategies/
│
├── core/
│   ├── engine.js        # executa estratégias
│   ├── data-provider.js # coleta dados (Yahoo etc)
│   └── utils.js
│
├── strategies/
│   ├── bleeding/
│   │   └── index.js
│   ├── breakout/
│   │   └── index.js
│   └── trend/
│       └── index.js
│
├── tasks/
│   └── run-strategies/
│       ├── task.config.yaml
│       └── index.js
│
└── README.md

````

---

# 4. Contrato de uma estratégia

Cada estratégia DEVE exportar:

```js
export default {
  name: "bleeding",

  analyze({ ticker, data, context }) {
    return {
      signal: "BUY" | "SELL" | "HOLD",
      score: number,
      metadata: object,
    };
  },
};
````

---

## Regras obrigatórias

* não acessar rede diretamente
* não fazer I/O
* não depender de outras estratégias
* ser determinística (mesmo input → mesmo output)

---

# 5. Engine (core/engine.js)

Responsável por:

* carregar estratégias dinamicamente
* executar todas sobre os dados
* agregar resultados
* retornar ranking

---

## Interface do engine

```js
export async function runStrategies({ tickers, strategies, dataProvider }) {
  const results = [];

  for (const ticker of tickers) {
    const data = await dataProvider(ticker);

    for (const strategy of strategies) {
      const result = strategy.analyze({
        ticker,
        data,
        context: {},
      });

      results.push({
        ticker,
        strategy: strategy.name,
        ...result,
      });
    }
  }

  return results;
}
```

---

# 6. Data Provider

Responsável por abstrair origem de dados.

Exemplo:

```js
export async function yahooProvider(ticker) {
  // fetch Yahoo
  return {
    closes: [],
    volumes: [],
  };
}
```

---

## Regras

* strategies NÃO conhecem a origem dos dados
* trocar provider não quebra strategies

---

# 7. Task (integração com cron-manager)

Cada execução do sistema é uma **task**

---

## task.config.yaml

```yaml
schema_version: 1

name: run-strategies
description: Run all market strategies

allow_manual: true
allow_cron: true

entrypoint: node index.js
working_dir: ./tasks/run-strategies

inputs:
  - name: tickers
    type: string
    required: true
    help_tip: Comma-separated tickers
```

---

## index.js (task)

```js
import { runStrategies } from "../../core/engine.js";
import { yahooProvider } from "../../core/data-provider.js";

import bleeding from "../../strategies/bleeding/index.js";
import breakout from "../../strategies/breakout/index.js";

export default async function (context) {
  const tickers = context.inputs.tickers.split(",");

  const results = await runStrategies({
    tickers,
    strategies: [bleeding, breakout],
    dataProvider: yahooProvider,
  });

  console.table(results);
}
```

---

# 8. Output (artifact)

Cada execução deve gerar um artifact estruturado:

```json
[
  {
    "ticker": "VALE3.SA",
    "strategy": "bleeding",
    "signal": "BUY",
    "score": 8.5,
    "metadata": {}
  }
]
```

---

# 9. Evolução futura

## Ranking de oportunidades

```js
results.sort((a, b) => b.score - a.score);
```

---

## Multi-strategy consensus

```js
// Exemplo:
BUY se 3+ estratégias concordam
```

---

## Histórico

Salvar artifacts para:

* backtest manual
* análise de performance

---

# 10. Boas práticas

* estratégias devem ser pequenas (<200 linhas)
* evitar lógica duplicada → usar utils
* sempre retornar score (comparabilidade)
* evitar hardcode de tickers

---

# 11. Anti-patterns (evitar)

❌ estratégia fazendo fetch de API
❌ estratégia salvando arquivo
❌ engine com lógica de estratégia
❌ acoplamento entre estratégias

---

# 12. Roadmap

* [ ] suporte a múltiplos providers
* [ ] sistema de score padronizado
* [ ] persistência de resultados
* [ ] alertas (Telegram)
* [ ] backtesting

---

# 13. Resumo

O **market-strategies** é:

* um framework modular
* baseado em plugins (estratégias)
* executado via tasks
* focado em desacoplamento total

---

```

---

Se quiser dar o próximo nível, posso te entregar:

- :contentReference[oaicite:0]{index=0}  
- ou :contentReference[oaicite:1]{index=1}  

Isso deixa seu framework MUITO mais elegante.
```
