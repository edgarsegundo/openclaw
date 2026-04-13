module.exports = {
  apps: [
    {
      name: "discord-bot",
      script: "./index.js",
      cwd: ".",
      watch: false,
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
