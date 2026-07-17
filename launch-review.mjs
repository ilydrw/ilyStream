// Temporary UI-review launcher (safe to delete): boots the app with an
// isolated userData profile so it can run alongside the real instance.
import { app } from 'electron'
import path from 'node:path'

app.setPath('userData', path.join(app.getPath('temp'), 'ilystream-ui-review-profile'))
await import('./out/main/index.js')
