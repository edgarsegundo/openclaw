# Manter fork atualizado

## How to fetch and merge

```bash
# Adicione o repositório original como remoto upstream (faça isso só uma vez):
git remote add upstream https://github.com/openclaw/openclaw.git

# Busque as atualizações do upstream:
git fetch upstream

# Sincronize seu branch com o branch correspondente do upstream (exemplo: main):
git checkout 20-feb-2026
git merge upstream/main

# Se o branch original for outro (ex: main ou dev), troque no comando acima.

# Resolva conflitos se aparecerem.

# Depois, envie as mudanças para seu fork no GitHub:

git push origin 20-feb-2026
```

## Updating production

```bash
pnpm install && pnpm ui:build && pnpm run build
openclaw gateway restart
```

## Atualizar apenas com tags estáveis

### Buscar tags do upstream

git fetch upstream --tags

### Criar branch temporário baseado na tag estável

git checkout -b stable-v2026.2.15 upstream/v2026.2.15

### Mesclar apenas commits da tag estável no seu branch

git checkout 20-feb-2026
git merge stable-v2026.2.15
