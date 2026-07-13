# ilyStream TikTok auth bridge

This service keeps TikTok OAuth credentials and future private LIVE API calls outside the Electron
application. The desktop receives only an opaque ilyStream session token.

## Implemented endpoints

- `POST /v1/tiktok/oauth/exchange`
- `GET /v1/tiktok/session`
- `POST /v1/tiktok/session/disconnect`
- `POST /v1/tiktok/live/prepare`
- `POST /v1/tiktok/live/complete`
- `GET /health`

The LIVE endpoints deliberately report `pending` until TikTok supplies and approves the private LIVE
partner contract. `PendingTikTokLiveProvider` is the single replacement point for that adapter.

## Required runtime configuration

| Variable | Purpose |
| --- | --- |
| `TIKTOK_CLIENT_KEY` | Public Login Kit client key from the TikTok Developer Portal |
| `TIKTOK_CLIENT_SECRET` | Secret used only by this service |
| `TIKTOK_BRIDGE_ENCRYPTION_KEY` | Base64-encoded 32-byte key for the encrypted session file |
| `TIKTOK_REDIRECT_URI` | Optional; defaults to `http://127.0.0.1:8792/callback/` |
| `TIKTOK_BRIDGE_HOST` | Optional; defaults to `127.0.0.1` |
| `TIKTOK_BRIDGE_PORT` | Optional; defaults to `8787` |
| `PORT` | Hosting-platform port; used when `TIKTOK_BRIDGE_PORT` is unset |
| `TIKTOK_BRIDGE_SESSION_FILE` | Optional persistent encrypted file location |
| `TIKTOK_DESKTOP_SESSION_TTL_DAYS` | Optional; defaults to `30` |

Do not put the client secret, encryption key, TikTok access token, or TikTok refresh token in the
Electron build, repository, logs, crash reports, or renderer settings.

## Commands

```powershell
npm run build:tiktok-bridge
npm run start:tiktok-bridge
```

The desktop build separately needs the public `ILYSTREAM_TIKTOK_CLIENT_KEY` and the HTTPS
`ILYSTREAM_TIKTOK_AUTH_BRIDGE_URL`.

## Railway deployment

Deploy `services/tiktok-auth-bridge` as the Railway service root, or run `railway up --path-as-root`
from this directory. The checked-in `railway.json` builds the service, starts it, and verifies
`/health` before routing traffic.

Attach a single Railway volume at `/data`, keep the service at one replica, and set
`TIKTOK_BRIDGE_SESSION_FILE=/data/tiktok-sessions.enc`. Railway supplies `PORT` automatically; when
it is present, the bridge listens on `0.0.0.0:$PORT`. Local runs keep the safer
`127.0.0.1:8787` default.

## Deployment requirements

- Terminate HTTPS before exposing the service publicly.
- Mount persistent storage for the encrypted session file and back it up securely.
- Run one service replica when using the included encrypted file store. Replace the
  `TikTokSessionStore` implementation with a transactional database adapter before scaling out.
- Apply IP and endpoint rate limits at the reverse proxy or edge.
- Keep outbound access limited to TikTok's official API hosts.
- Rotate the bridge encryption key and TikTok client secret through the hosting platform's secret
  manager, not through source control.

The OAuth implementation follows TikTok's official OAuth v2 token, refresh, revoke, and user-info
contracts:

- https://developers.tiktok.com/doc/oauth-user-access-token-management
- https://developers.tiktok.com/doc/tiktok-api-v2-get-user-info/
