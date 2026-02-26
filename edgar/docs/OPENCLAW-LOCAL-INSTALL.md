```bash
# Apenas uma vez

pnpm install
pnpm add dotenv -w

# para criar o gateway
pnpm build

Terminal 1:
dir: openclaw
❯ pnpm gateway:dev

Terminal 2:
dir: openclaw
❯ pnpm ui:dev

Terminal 3:
dir: openclaw/edgar/api
❯ node ./server.js

Terminal 4:
dir: openclaw/edgar/fastvistos-dashboard-vue
❯ pnpm dev


cat ~/.openclaw-dev/openclaw.json | grep token
```

Depois acesse a URL com o token:

http://127.0.0.1:19001?token=TOKEN

or

http://localhost:5173/
