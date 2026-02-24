```bash
# Apenas uma vez

pnpm install
pnpm add dotenv -w

# para criar o gateway
pnpm build

Terminal 1: pnpm gateway:dev
Terminal 2: pnpm ui:dev

cat ~/.openclaw-dev/openclaw.json | grep token
```

Depois acesse a URL com o token:

http://127.0.0.1:19001?token=TOKEN
