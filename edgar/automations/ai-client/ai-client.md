Perfeito.
Aqui vai um **tutorial prático, direto e completo de como usar sua versão final**, focado em uso — não na implementação.

Você já tem o `AIClient`.
Agora vamos focar em **como operar corretamente**.

---

# AIClient — Step-by-Step Usage Guide

---

# 1️⃣ Mental Model (Important)

Seu `AIClient` tem dois modos:

| Método                 | Quando usar                          |
| ---------------------- | ------------------------------------ |
| `generateText()`       | Quando você quer texto livre         |
| `generateStructured()` | Quando você precisa de JSON validado |

Se você precisa de dados confiáveis → **sempre use `generateStructured`**.

---

# 2️⃣ Inicialização (Uma vez no app)

Você precisa apenas:

- Um `aiCallback`
- Criar uma instância do `AIClient`

Depois disso, reutilize essa instância no app inteiro.

Exemplo mental:

```
App start
   ↓
Create AIClient
   ↓
Reuse everywhere
```

Não crie múltiplas instâncias desnecessariamente.

---

# 3️⃣ Gerando Texto Livre

Use quando:

- Você quer explicações
- Você quer copy
- Você quer resposta natural
- Não precisa validar estrutura

Uso:

```js
await ai.generateText({
  prompt: "Explain Docker in simple terms.",
});
```

### Boas práticas

- Use temperatura maior (0.7+) para criatividade
- Use temperatura baixa (0.2–0.3) para respostas técnicas

---

# 4️⃣ Gerando JSON Estruturado (Modo Principal)

Esse é o modo importante.

Você precisa de duas coisas:

1. Um prompt claro
2. Um schema Zod

Eles devem ficar **juntos**, no mesmo local.

---

## Passo 4.1 — Escreva o Prompt Corretamente

Sempre inclua:

```
Return ONLY valid JSON.
Do not add explanations.
```

Isso reduz drasticamente erros.

Exemplo de prompt correto:

```
Return a JSON object with:
- name
- age
- email

The person must be fictional.
Return ONLY valid JSON.
```

Evite:

- Pedidos ambíguos
- Linguagem vaga
- JSON misturado com texto

---

## Passo 4.2 — Defina o Schema no Mesmo Lugar

Defina inline:

```js
schema: z.object({
  name: z.string(),
  age: z.number(),
  email: z.string().email(),
});
```

Mantenha próximo do prompt.
Não espalhe schemas se não forem reutilizados.

---

## Passo 4.3 — Execute

```js
await ai.generateStructured({
  prompt,
  schema,
});
```

Pronto.

Você recebe:

- JSON válido
- Campos corretos
- Tipos corretos
- Dados reparados automaticamente se necessário

---

# 5️⃣ O Que Acontece Internamente (Importante Entender)

Quando você chama `generateStructured`, o fluxo é:

```
Model Response
   ↓
Extract JSON
   ↓
Syntax validation
   ↓
(if broken) → Syntax repair
   ↓
Schema validation
   ↓
(if invalid) → Field repair
   ↓
Return validated object
```

Se tudo falhar após retries → lança erro.

Você nunca recebe JSON quebrado.

---

# 6️⃣ Tratamento de Erro (Obrigatório em Produção)

Sempre use try/catch:

```js
try {
  const result = await ai.generateStructured({...});
} catch (error) {
  // Log
  // Fallback
  // Return safe response
}
```

O erro pode ser:

- Timeout
- Falha após retries
- Schema impossível de satisfazer

Nunca deixe isso estourar sem controle.

---

# 7️⃣ Configuração Recomendada

Para produção estável:

```
defaultTemperature: 0.3
maxRetries: 2
maxRepairAttempts: 1
timeoutMs: 30000
```

Evite:

- Retries infinitos
- Temperatura alta para JSON estruturado

---

# 8️⃣ Quando Usar Structured vs Text

Use Structured quando:

- Gerando metadata
- Criando objetos de banco
- Extraindo dados
- Pipeline automático
- AI → Database
- AI → API

Use Text quando:

- Chat
- Copywriting
- Explicações
- Ideias

---

# 9️⃣ Casos Reais de Uso

### ✔ Blog Metadata Generator

### ✔ Product description normalizer

### ✔ Lead extraction

### ✔ Internal automation

### ✔ AI microservices

### ✔ Content pipeline

Esse client foi feito para:

> AI como infraestrutura, não como brinquedo.

---

# 🔟 Regras de Ouro

1. Sempre peça “ONLY valid JSON”.
2. Use temperatura baixa para structured.
3. Use schema o mais específico possível.
4. Não reutilize schema genérico demais.
5. Trate erro sempre.
6. Reutilize uma única instância do client.

---

# 1️⃣1️⃣ O Que Você NÃO Precisa Fazer

Você NÃO precisa:

- Validar JSON manualmente
- Fazer retry manual
- Tratar campo faltando
- Verificar tipo manualmente
- Remover markdown manualmente

O AIClient já faz isso.

---

# 1️⃣2️⃣ Arquitetura Recomendada

```
Controller / Service
       ↓
AIClient.generateStructured()
       ↓
Validated Object
       ↓
Database / API / Pipeline
```

AIClient deve ser sua **fronteira de segurança**.

---

# 🎯 Final Mental Model

O modelo pode errar.

Seu AIClient não pode.

Ele é:

> Uma camada determinística entre o caos do LLM e o seu sistema.

---

Se quiser, posso agora:

- Mostrar padrões avançados de uso em SaaS
- Ou mostrar como transformar isso em micro-framework interno
- Ou revisar seus prompts para maximizar confiabilidade
