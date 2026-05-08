module.exports = {
  apps: [
    {
      name: "senmon-nyuugaku",
      script: "node_modules/.bin/next",
      args: "start",
      cwd: "/home/work/.openclaw/workspace/senmon-nyuugaku",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
  ],
};
