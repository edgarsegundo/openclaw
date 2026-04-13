# Discord Command Listener

Implementação baseada na SPEC.md

## Setup

1. Instale as dependências:

```bash
npm install discord.js dotenv node-fetch
```

2. Copie `.env.example` para `.env` e preencha os valores.

3. Execute o bot:

```bash
node index.js
```

## Estrutura

- `index.js`: Entrada principal
- `dispatcher.js`: Roteador de comandos
- `commands/`: Comandos individuais (exemplo: `pub.js`)

## Adicionando comandos

1. Crie um novo arquivo em `commands/`, por exemplo `delete.js`.
2. Registre no objeto `commands` em `dispatcher.js`.

## Observações

- O bot escuta todos os canais por padrão, ou limita via `CHANNEL_ID` no `.env`.
- Cada comando pode disparar APIs, scripts, jobs, etc.

Consulte a SPEC.md para detalhes completos.
