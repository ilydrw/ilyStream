const { app, screen } = require('electron'); app.whenReady().then(() => { console.log(JSON.stringify(screen.getAllDisplays(), null, 2)); app.quit(); });
