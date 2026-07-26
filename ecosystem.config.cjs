// pm2 deploy manifest for roofing.sydney production (VPS 31.97.222.218).
// Captured from the live `roofing-sydney` process on 2026-07-27 (THE-354) so the
// deploy path is reproducible from source instead of living only in pm2's dump.
//
// Deploy (operator-only, per CLAUDE.md §1):
//   cd /home/clawdbot/roofing.sydney && git pull && npm ci && npm run build \
//     && pm2 startOrReload ecosystem.config.cjs
//
// Runtime secrets are NOT here: they load from an untracked `.env.local` in the
// same directory (gitignored via `.env*`). Adding this file does not change the
// running process — pm2 keeps its own dump until an operator reloads it.
module.exports = {
  apps: [
    {
      name: "roofing-sydney",
      cwd: "/home/clawdbot/roofing.sydney",
      script: "node_modules/next/dist/bin/next",
      args: "start",
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "600M",
      time: true,
      env: {
        NODE_ENV: "production",
        PORT: "3402",
      },
    },
  ],
};
