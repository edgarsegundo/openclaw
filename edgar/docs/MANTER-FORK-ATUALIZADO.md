# Manter fork atualizado

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
