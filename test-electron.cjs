const { app, desktopCapturer } = require('electron');

app.whenReady().then(async () => {
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1920, height: 1080 } });
  const thumb = sources[0].thumbnail;
  const sz = thumb.getSize();
  const bmp = thumb.toBitmap();
  console.log('Logical size:', sz);
  console.log('Bitmap length:', bmp.length);
  console.log('Expected length:', sz.width * sz.height * 4);
  app.quit();
});
