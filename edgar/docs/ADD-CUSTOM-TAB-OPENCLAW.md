# Como adicionar uma nova Tab personalizada no menu lateral do OpenClaw

Este guia mostra como criar uma nova tab no menu lateral do OpenClaw, usando monkeypatches para manter as customizações isoladas do código original. O exemplo usa o comentário `// [edgar]` para marcar as alterações.

## 1. Crie/edite o arquivo de navegação customizado

Crie ou modifique o arquivo de monkeypatch, por exemplo:  
navigation.ts

- Copie o conteúdo de navigation.ts para esse arquivo.
- Adicione sua nova tab no array `TAB_GROUPS` e no objeto `TAB_PATHS`:

  ```ts
  export const TAB_GROUPS = [
    // ...
    { label: "edgar", tabs: ["fastvistos", "discord"] }, // [edgar]
    // ...
  ];

  const TAB_PATHS: Record<Tab, string> = {
    // ...
    fastvistos: "/fastvistos", // [edgar]
    discord: "/discord", // [edgar]
  };
  ```

- Adicione o nome da tab ao tipo `Tab` e, se quiser, um ícone em `iconForTab`.

## 2. Crie/edite o arquivo de traduções customizado

Crie um arquivo ou modifique de monkeypatch para traduções, por exemplo:  
en.ts

- Copie o conteúdo de en.ts para esse arquivo.
- Adicione as traduções para sua tab:
  ```ts
  tabs: {
    // ...
    fastvistos: "Fastvistos", // [edgar]
    discord: "Discord",       // [edgar]
  },
  subtitles: {
    // ...
    fastvistos: "Visa application tracker and status dashboard.", // [edgar]
  },
  ```

## 3. (Opcional) Crie um arquivo de renderização customizado

Se precisar customizar a renderização da tab, crie um monkeypatch para o arquivo correspondente, por exemplo:  
app-render.ts  
Copie o original de app-render.ts e faça as alterações necessárias.

## 4. (Opcional) Crie a view da sua tab

Se sua tab for uma página nova, crie um arquivo como  
fastvistos.ts  
com o conteúdo da view.

## 5. Registre os monkeypatches no Vite

Abra vite.config.ts e adicione seus monkeypatches na lista de plugins:

```ts
plugins: [
  monkeypatch("src/ui/navigation.ts", "../edgar/monkeypatches/navigation.ts"),
  monkeypatch("src/i18n/locales/en.ts", "../edgar/monkeypatches/en.ts"),
  monkeypatch("src/ui/app-render.ts", "../edgar/monkeypatches/app-render.ts"),
  monkeypatch("src/ui/views/fastvistos.ts", "../edgar/monkeypatches/fastvistos.ts"),
],
```

## 6. Rode o projeto

Execute o build/dev normalmente. O menu lateral exibirá sua nova tab, com as rotas, traduções e views customizadas.

---

**Resumo:**

- Sempre copie o arquivo original para a pasta de monkeypatches antes de modificar.
- Marque suas mudanças com `// [edgar]` para fácil rastreio.
- Registre todos os monkeypatches no `vite.config.ts`.
- Use o padrão para qualquer nova tab ou view customizada.

Assim, suas customizações ficam isoladas e fáceis de manter!
