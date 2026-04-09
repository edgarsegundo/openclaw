node bin/cron-manager.js run rss-picker --template feed-selector-visto-americano  --input-file tasks/rss-picker/inputs/inputs-visto-americano.json

node --inspect-brk bin/cron-manager.js run rss-picker --template feed-selector-visto-americano --input-file tasks/rss-picker/inputs/inputs-visto-americano.json


No Mac é a mesma coisa! No VSCode:

Cmd+Shift+P → digite "Attach to Node Process" → Enter
Selecione o processo cron-manager.js na lista
Coloque breakpoints no index.js do rss-picker clicando na margem esquerda
