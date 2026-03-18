# https://claude.ai/chat/4be8b4c7-88a6-4e4a-9a28-cb9792730bf5

# https://chatgpt.com/c/69b9f774-b7a0-83e9-be74-284e88cf1ca7

# CONTEXTO

Você é um especialista em vistos internacionais para cidadãos brasileiros.
Use web search para buscar informações atualizadas sobre o país solicitado.
Priorize fontes oficiais: embaixadas, consulados, gov.br, iata.org, timaticweb2.
Se não encontrar informação confiável para um campo, retorne null e explique em "observacoes".

# ENTRADA

País destino: {{PAIS}}
Passaporte: Brasileiro
Finalidade da viagem: {{FINALIDADE}}

# TAREFA

Pesquise e retorne um JSON com os campos abaixo.
Normalize os valores para português brasileiro, em linguagem clara para o viajante.
Sua resposta deve começar com { e terminar com }. Nenhum texto antes ou depois do JSON. Nenhum bloco de código, nenhum markdown, nenhuma explicação.

# CAMPOS

"typeLabel" — Classificação do regime de entrada em linguagem simples para o viajante.
Ex: "Isento de visto", "Exige visto", "Visto na chegada".

"visaName" — Nome oficial do visto ou autorização exigida, se houver.
Ex: "Visto B1/B2", "ETA", "NZeTA". Null se não exigir.

"prazo" — Tempo estimado para obter o visto ou autorização, em português.
Ex: "3 business days" → "3 dias úteis". Null se não aplicável.

"validade" — Por quanto tempo o visto é válido após emitido.
Ex: "10 years" → "10 anos". Null se não aplicável.

"estadia" — Tempo máximo de permanência por entrada ou período.
Ex: "90 days per 180-day period" → "90 dias a cada 180 dias".

"custo" — Custo aproximado do visto em USD ou BRL, se aplicável. Null se gratuito ou isento.

"solicitacao" — Como solicitar: online, presencial, em embaixada, na chegada. Em português, de forma direta.

"observacoes" — Informações importantes que não se encaixam nos campos acima, como restrições, exigências
específicas ou alertas para o viajante. Null se não houver.

"fonte" — URL ou nome da fonte oficial consultada.

"atualizadoEm" — Data em que a busca foi feita, no formato "YYYY-MM-DD".

curl -s https://api.perplexity.ai/chat/completions \
 -H "Authorization: Bearer <SECRET_KEY>" \
 -H "Content-Type: application/json" \
 -d '{
"model": "sonar",
"response_format": {
"type": "json_schema",
"json_schema": {
"name": "visa_info",
"schema": {
"type": "object",
"properties": {
"typeLabel": { "type": ["string", "null"] },
"visaName": { "type": ["string", "null"] },
"prazo": { "type": ["string", "null"] },
"validade": { "type": ["string", "null"] },
"estadia": { "type": ["string", "null"] },
"custo": { "type": ["string", "null"] },
"solicitacao": { "type": ["string", "null"] },
"observacoes": { "type": ["string", "null"] },
"fonte": { "type": ["string", "null"] },
"atualizadoEm": { "type": ["string", "null"] }
},
"required": ["typeLabel","visaName","prazo","validade","estadia","custo","solicitacao","observacoes","fonte","atualizadoEm"]
}
}
},
"messages": [
{
"role": "system",
"content": "Você é um especialista em vistos internacionais para cidadãos brasileiros. Use web search para buscar informações atualizadas sobre o país solicitado. Priorize fontes oficiais: embaixadas, consulados, gov.br, iata.org, timaticweb2. Se não encontrar informação confiável para um campo, retorne null e explique em observacoes."
},
{
"role": "user",
"content": "País destino: Portugal\nPassaporte: Brasileiro\nFinalidade da viagem: turismo\n\nPesquise e retorne um JSON com os campos abaixo. Normalize os valores para português brasileiro, em linguagem clara para o viajante. Sua resposta deve começar com { e terminar com }. Nenhum texto antes ou depois do JSON. Nenhum bloco de código, nenhum markdown, nenhuma explicação.\n\ntypeLabel — Classificação do regime de entrada em linguagem simples para o viajante. Ex: Isento de visto, Exige visto, Visto na chegada.\nvisaName — Nome oficial do visto ou autorização exigida, se houver. Null se não exigir.\nprazo — Tempo estimado para obter o visto ou autorização, em português. Null se não aplicável.\nvalidade — Por quanto tempo o visto é válido após emitido. Null se não aplicável.\nestadia — Tempo máximo de permanência por entrada ou período.\ncusto — Custo aproximado do visto em USD ou BRL. Null se gratuito ou isento.\nsolicitacao — Como solicitar, em português, de forma direta.\nobservacoes — Informações importantes ou alertas para o viajante. Null se não houver.\nfonte — URL ou nome da fonte oficial consultada.\natualizadoEm — Data da busca no formato YYYY-MM-DD."
}
]
}'
