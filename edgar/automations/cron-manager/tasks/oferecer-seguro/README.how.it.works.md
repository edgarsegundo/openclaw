# oferecer-seguro — How it works (ultra conciso)

1. Busca todos os clientes na tabela `notificacoes_seguros` com viagem nos próximos 14 dias e que ainda não foram notificados (`data_notificacao IS NULL`).
2. Para cada cliente:
   - Monta uma mensagem personalizada com nome, data da viagem e link para WhatsApp Business com texto de oferta de seguro viagem com 10% de desconto.
   - Envia a mensagem para o canal do Discord configurado (via webhook).
   - Atualiza o campo `data_notificacao` na tabela, marcando que o cliente já foi notificado.
3. Se não houver clientes novos, apenas registra que não há notificações a fazer.

- Nunca repete notificação para o mesmo cliente/data_viagem.
- A lista de clientes é alimentada por importação (ex: via script/import-clientes.js).
- A execução é idempotente e pode ser agendada via cron.
