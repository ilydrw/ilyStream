# ilyStream

Multi-platform livestream control center for chat, TTS, overlays, alerts, broadcast audio, and smart-light integrations.

## Version

`0.0.4`

## Development

```bash
npm install
npm run dev
```

## Windows Installer

End users should install ilyStream from the Windows setup file attached to a GitHub Release:

- `ilyStream-Setup-0.0.4.exe` for the normal installer
- `ilyStream-Portable-0.0.4.exe` for a portable build

The packaged app does not require a terminal window. When future versions are published as GitHub Releases, ilyStream checks for updates in the background, downloads them, and installs them the next time the app quits.

## Local Build

```bash
npm run build
npm run package
```

Tagged GitHub releases are built by `.github/workflows/release.yml`.

## Test

```bash
npm test
```

## Notes

Runtime credentials, app databases, local logs, generated builds, and scratch/debug artifacts are intentionally excluded from git.
