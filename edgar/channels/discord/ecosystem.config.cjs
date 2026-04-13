module.exports = {
  apps: [
    {
      name: "discord-bot",
      script: "./index.js",
      cwd: ".",
      watch: false,
      env_file: ".env",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
