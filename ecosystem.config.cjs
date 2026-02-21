module.exports = {
  apps: [
    {
      name: "openclaw",
      script: "/home/ubuntu/openclaw/dist/index.js",
      args: "gateway --bind loopback --port 18789",
      env_file: "/home/ubuntu/openclaw/.env",
      restart_delay: 5000,
      autorestart: true,
    },
  ],
};
