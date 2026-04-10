O tipo `artifact` serve para encadear tarefas no cron-manager, permitindo que uma task use como input um arquivo (artifact) gerado por outra task anterior. Assim, você pode criar pipelines onde a saída de uma etapa alimenta a próxima automaticamente, sem precisar copiar/colar ou editar arquivos manualmente.

### Como funciona

Quando um input é declarado como `type: artifact`, você precisa informar:
- `from_task`: o nome da task que produziu o artifact
- `artifact`: o nome do arquivo/artifact gerado (conforme declarado na config da task anterior)

O runner então carrega esse arquivo JSON automaticamente e injeta o conteúdo como input para a próxima task.

---

### Exemplo de uso

#### 1. Task A: Gera um artifact

**task-a/task.config.yaml**
```yaml
artifacts:
  - name: result
    description: Resultado processado
    path: result.json
```

**task-a/index.js**
```js
await saveArtifact("result", { foo: 123, bar: 456 });
```

---

#### 2. Task B: Consome o artifact de Task A

**task-b/task.config.yaml**
```yaml
inputs:
  - name: previous_result
    type: artifact
    from_task: task-a
    artifact: result
```

**task-b/index.js**
```js
export default async function(context) {
  // context.inputs.previous_result conterá { foo: 123, bar: 456 }
}
```

---

### Quando usar

- Quando você quer criar um fluxo automatizado de processamento, onde cada etapa depende da saída da anterior.
- Quando precisa garantir que o dado passado entre tasks é sempre o mais recente e correto, sem intervenção manual.

---

**Resumo:**  
Use `type: artifact` para conectar tasks em pipelines, automatizando o uso de arquivos de saída como entrada para a próxima etapa.
