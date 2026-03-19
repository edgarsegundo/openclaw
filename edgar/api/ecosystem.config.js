module.exports = {
  apps: [
    {
      name: "visa-api",
      script: "server.js",
      env_file: ".env",
      env: {
        PORT: 3099, // defina aqui a porta desejada
      },
      watch: false,
    },
  ],
};
