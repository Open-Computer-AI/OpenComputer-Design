# Quickstart

Run OpenComputer Design locally. Fork of nexu-io/open-design (Apache-2.0).

Website: [tryopencomputer.com](https://tryopencomputer.com)

## Environment requirements

- **Node.js:** `~24` (Node 24.x). The repo enforces this through `package.json#engines`.
- **pnpm:** `10.33.x`. The repo pins `pnpm@10.33.2` through `packageManager`; use Corepack so the pinned version is selected automatically.
- **OS:** macOS, Linux, and WSL2 are the primary paths. If your tooling runs inside WSL2, use the [`WSL2 setup guide`](docs/wsl-setup.md). Windows native is supported; see [`docs/windows-troubleshooting.md`](docs/windows-troubleshooting.md).
- **Inferno:** paste an API key in **Settings**. The daemon calls `https://router.tryopencomputer.com/v1`. There is no other model backend in this distribution.

[`nvm`](https://github.com/nvm-sh/nvm) / [`fnm`](https://github.com/Schniz/fnm) are optional. If you use one, install/select Node 24 before running pnpm:

```bash
# nvm
nvm install 24
nvm use 24

# fnm
fnm install 24
fnm use 24
```

Then enable Corepack:

```bash
corepack enable
corepack pnpm --version   # should print 10.33.2
```

## Docker

Requires Docker Desktop and Docker Compose v2.

```bash
cd deploy
cp .env.example .env
```

Generate a token (`openssl rand -hex 32`), paste it into `OD_API_TOKEN=` in `.env`, then:

```bash
docker compose up -d
```

Open `http://127.0.0.1:7456`. `OD_API_TOKEN` authenticates the daemon; it is **not** the Inferno key. Paste the Inferno key in Settings after the UI loads.

```env
OPEN_DESIGN_PORT=7456
OPEN_DESIGN_MEM_LIMIT=384m
OPEN_DESIGN_ALLOWED_ORIGINS=https://yourdomain.com
OD_API_TOKEN=
```

Before documenting, changing, or choosing any persistent daemon storage path, read root `AGENTS.md` → **Daemon data directory contract**. This Quickstart MUST NOT restate that contract.

## One-shot (dev mode)

```bash
corepack enable
pnpm install
pnpm tools-dev run web
# open the web URL printed by tools-dev
```

On first load, open **Settings**, paste the Inferno key, Save. Choose a design template and a design system, type a prompt, hit **Send**. Inferno streams text; the daemon writes `<artifact>` blocks to project files and the preview updates.

The **Design systems** catalog is loaded from [`design-systems/`](design-systems/). **Templates** come from [`design-templates/`](design-templates/). [`skills/`](skills/) is reserved for functional capabilities.

## Other scripts

```bash
pnpm tools-dev                 # daemon + web + desktop in the background
pnpm tools-dev start web       # daemon + web in the background
pnpm tools-dev run web         # daemon + web in the foreground (e2e/dev server)
pnpm tools-dev restart         # restart daemon + web + desktop
pnpm tools-dev restart --daemon-port 7457 --web-port 5175
pnpm tools-dev status          # inspect managed runtimes
pnpm tools-dev logs            # show daemon/web/desktop logs
pnpm tools-dev check           # status + recent logs + common diagnostics
pnpm tools-dev stop            # stop managed runtimes
pnpm --filter @open-design/daemon build  # build apps/daemon/dist/cli.js for `ocd`
pnpm --filter @open-design/web build     # build the web package when needed
pnpm typecheck                 # workspace typecheck
```

`pnpm tools-dev` is the only local lifecycle entry point. Do not use the removed legacy root aliases (`pnpm dev`, `pnpm dev:all`, `pnpm daemon`, `pnpm preview`, `pnpm start`).

`tools-dev` loads workspace env files before resolving ports. Default precedence is `.env.development.local`, then `.env.local`, then `.env.development`, then `.env`. Use `--no-env-file` to disable loading or repeat `--env-file <path>` for explicit files.

During local development, `tools-dev` starts the daemon first, passes its port into `apps/web`, and `apps/web/next.config.ts` rewrites `/api/*`, `/artifacts/*`, and `/frames/*` to that daemon port.

## CLI (`ocd`)

```bash
pnpm --filter @open-design/daemon build
ocd --help
ocd --port 7456
ocd mcp install <agent>
```

Media / HyperFrames skills that shell out use daemon-injected env:

- `OD_BIN` — absolute path to `apps/daemon/dist/cli.js`.
- `OD_DAEMON_URL` — the running daemon URL.
- `OD_PROJECT_ID` — the active project id.
- `OD_PROJECT_DIR` — the active project's file directory.

If a skill fails with `OD_BIN: parameter not set` or `failed to reach daemon at http://127.0.0.1:0`, rebuild and restart:

```bash
pnpm --filter @open-design/daemon build
pnpm tools-dev restart --daemon-port 7457 --web-port 5175
```

`OD_DAEMON_URL` must be a real daemon port such as `http://127.0.0.1:7457`, not `http://127.0.0.1:0`.

For production daemon-only mode, the daemon serves the static Next.js export at `http://127.0.0.1:7456`.

If you place nginx in front of the daemon, keep SSE routes unbuffered and uncompressed:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:7456;
    proxy_buffering off;
    gzip off;
    proxy_read_timeout 86400s;
    proxy_send_timeout 86400s;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## Execution

This distribution always uses Inferno over the daemon API path (`mode: 'api'`). Frontend → daemon `/api/proxy/inferno/stream` → Inferno SSE → `<artifact>` parser → project files → preview.

## Prompt composition

```
BASE_SYSTEM_PROMPT   (text_artifact / <artifact> handoff)
   + active design system body  (DESIGN.md)
   + active skill body          (SKILL.md)
```

## File map

```
OpenComputer-Design/
├── apps/
│   ├── daemon/                # Node/Express — Inferno proxy + APIs + `ocd` bin
│   ├── web/                   # Next.js App Router + React client
│   └── desktop/               # Electron runtime
├── packages/                  # @open-design/* workspace packages
├── tools/dev/                 # `pnpm tools-dev`
├── skills/
├── design-templates/
├── design-systems/
└── package.json               # root quality scripts + `ocd` bin
```

## Troubleshooting

- **`better-sqlite3` fails to load / ABI mismatch** — `pnpm install` rebuilds the native addon. Manual: `pnpm --filter @open-design/daemon rebuild better-sqlite3`.
- **Generate stays disabled** — paste an Inferno key in Settings and wait for the model catalog. Errors stay Inferno errors; do not install another provider.
- **daemon 500 on /api/chat** — check the daemon terminal; typed codes are `INFERNO_*`.
- **artifact never renders** — confirm the response contains one complete `<artifact>` block and that file-write events reached the daemon.

## Specs

- `docs/architecture.md` — shipped stack
- `docs/skills-protocol.md` — `SKILL.md` / templates
- `docs/modes.md` — artifact modes
- `AGENTS.md` — daemon data directory contract
