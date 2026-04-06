node bin/cron-manager.js run write-article --template searchable-ai --input-file ./tasks/write-article/inputs/guia-visto-americano-turismo/cluster.result.json --article-index 0

node bin/cron-manager.js run resolve-internal-links --input-file <(echo '{"cluster_folder": "guia-visto-americano-turismo"}')

node bin/cron-manager.js run resolve-internal-links
