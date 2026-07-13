# TikTok LIVE partner application for ilyStream

The submission checklist, reviewer instructions, architecture diagram, and timed demo script are in
[`tiktok-review-package.md`](./tiktok-review-package.md).

## Goal

Request application-level access for ilyStream to let eligible creators authorize their TikTok
accounts and publish a LIVE stream directly from ilyStream without manually copying a stream key.

TikTok must provide the private LIVE API contract and approve ilyStream before the native provider
can be enabled. Public Login Kit authorization alone does not grant LIVE ingestion access.

## Portal setup

1. Create an organization and register **ilyStream** as a Desktop app in TikTok for Developers.
2. Add Login Kit and request `user.info.basic`.
3. Register this exact desktop redirect URI:

   `http://127.0.0.1:8792/callback/`

4. Verify the ilyStream website, Privacy Policy, and Terms of Service URLs.
5. Configure `ILYSTREAM_TIKTOK_CLIENT_KEY` for production builds. This is the public Login Kit key.
6. Deploy the secure auth bridge and configure its HTTPS origin as
   `ILYSTREAM_TIKTOK_AUTH_BRIDGE_URL`.
7. Submit the app for review with an end-to-end demonstration video.

The deployable bridge implementation lives in `services/tiktok-auth-bridge`. It exchanges and
refreshes TikTok OAuth credentials, retrieves `user.info.basic`, revokes access on disconnect, stores
credentials in an encrypted server-side session file, and returns only an opaque ilyStream session
token to the desktop. Its LIVE provider intentionally stays in `pending` state until TikTok supplies
the approved private LIVE API contract.

Never ship the TikTok client secret in Electron, renderer code, application settings, logs, or the
repository. The auth bridge owns the client secret, token exchange, refresh flow, and TikTok partner
API calls.

## Partner support request

**Subject:** Third-party PC LIVE streaming integration request for ilyStream

**Message:**

> ilyStream is a Windows desktop broadcast application for creators. It provides scene composition,
> camera and audio capture, vertical and horizontal outputs, overlays, chat, alerts, recording, and
> multi-platform RTMP encoding.
>
> We are requesting TikTok third-party PC LIVE streaming partner access. Our desired integration lets
> eligible creators sign in with TikTok, authorize ilyStream, check their TikTok LIVE eligibility,
> configure the LIVE title and orientation, create a LIVE room, receive short-lived RTMPS ingest
> credentials, start the stream, monitor status, and cleanly end the LIVE session. Creators who are not
> eligible should receive TikTok's official application or eligibility flow. Creators with RTMP-only
> access can already use their TikTok-provided server URL and stream key in ilyStream.
>
> We do not intend to scrape TikTok LIVE Center, extract credentials from cookies, reverse-engineer
> another partner's API, or store TikTok client secrets in the desktop application. OAuth token
> exchange, token refresh, eligibility checks, and LIVE API calls will run on an HTTPS backend. The
> desktop app uses OAuth state and PKCE, stores only an encrypted ilyStream session credential, and
> requests ingest credentials immediately before a broadcast.
>
> Please advise on the application process and documentation for native TikTok LIVE room creation,
> creator eligibility/application status, ingest provisioning, LIVE status, and session termination.

Attach the following before submission:

- Public product website
- Privacy Policy and Terms of Service
- Support contact
- Windows installer or reviewer build
- Reviewer account and setup steps
- Two-to-five minute end-to-end demonstration video
- Architecture and token-handling diagram
- Abuse reporting, moderation, and account-disconnect behavior
- Expected launch date, target creators, and estimated usage

## ilyStream auth bridge contract

These are ilyStream-owned endpoints, not assumed TikTok endpoints. The bridge adapts them to the
private contract TikTok provides after approval.

### Exchange the desktop authorization grant

`POST /v1/tiktok/oauth/exchange`

Request:

```json
{
  "clientKey": "public-login-kit-client-key",
  "code": "one-time-authorization-code",
  "codeVerifier": "pkce-code-verifier",
  "redirectUri": "http://127.0.0.1:8792/callback/"
}
```

Response:

```json
{
  "desktopAccessToken": "opaque-ilystream-session-token",
  "account": {
    "openId": "creator-open-id",
    "displayName": "Creator"
  },
  "liveAccess": "pending",
  "message": "TikTok LIVE access is under review."
}
```

### Read the current account and entitlement

`GET /v1/tiktok/session`

Use `Authorization: Bearer <opaque-ilystream-session-token>`.

The response uses the same `account`, `liveAccess`, and `message` fields. `liveAccess` is one of
`unknown`, `pending`, `approved`, `rtmp-only`, or `denied`.

### Disconnect

`POST /v1/tiktok/session/disconnect`

The bridge revokes or deletes server-side TikTok credentials before invalidating the ilyStream
desktop session.

### Prepare a native LIVE destination

`POST /v1/tiktok/live/prepare`

Request:

```json
{
  "title": "Optional stream title",
  "orientation": "portrait"
}
```

Response:

```json
{
  "rtmpUrl": "rtmps://tiktok-provided-ingest.example/live",
  "streamKey": "short-lived-key",
  "liveId": "provider-live-id",
  "watchUrl": "https://www.tiktok.com/@creator/live",
  "title": "Approved title"
}
```

The bridge must not return an ingest destination unless the account is currently authorized and
TikTok reports that native LIVE access is approved.

### Complete the active LIVE session

`POST /v1/tiktok/live/complete`

The bridge ends or finalizes the active TikTok LIVE session associated with the authenticated
desktop session. It should be idempotent so retries are safe. The bridge must also reconcile orphaned
LIVE sessions if the desktop app exits unexpectedly or loses connectivity before this request.
