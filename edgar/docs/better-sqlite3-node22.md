# better-sqlite3 + Node.js v22

## Problema

O `better-sqlite3` é um módulo nativo compilado em C++. Versões `≤ 8.x` não suportam Node 22.

| Pacote               | Node suportado | Status          |
| -------------------- | -------------- | --------------- |
| better-sqlite3 ≤ 8.x | ≤ Node 21      | ❌ Incompatível |
| better-sqlite3 9.x+  | Node 22+       | ✅ Compatível   |

## Sintomas

Erro ao fazer rebuild:

```
./src/util/macros.lzz:150:35: error: no matching member function for call to 'SetAccessor'
```

Erro ao iniciar sem rebuild:

```
Error: Could not locate the bindings file. Tried: .../better_sqlite3.node
```

## Solução

```bash
pnpm add better-sqlite3@latest
```

Verificar se o `package.json` não tem a versão pinada:

```json
"better-sqlite3": "^9.0.0"   // ✅ correto
"better-sqlite3": "8.7.0"    // ❌ vai falhar no Node 22
```

## Por que acontece ao trocar de máquina?

O `node_modules` copiado de outro OS (ex: Linux → macOS) contém binários incompatíveis. O pnpm tenta recompilar na instalação — e falha se a versão do pacote não suportar o Node atual.

Alternativa sem atualizar versão:

```bash
rm -rf node_modules && pnpm install
```

> Só funciona se a versão instalada já suportar o Node atual.
