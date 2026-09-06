module.exports = {
  apps: [
    {
      name: "furncher-app",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3040",
      exec_mode: "fork",
      instances: 1,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};

  