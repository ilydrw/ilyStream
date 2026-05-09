// Web Worker for processing frames off-thread
self.onmessage = async (e) => {
  const { frameId, bitmap, quality } = e.data;

  try {
    // Create an OffscreenCanvas to handle the compression
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(bitmap, 0, 0);
    bitmap.close(); // Free GPU memory immediately

    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
    const buffer = await blob.arrayBuffer();

    // Send back to main thread or directly to IPC if possible
    // In Electron, we have to send it back to the main thread to use window.api
    self.postMessage({ frameId, buffer }, [buffer]);
  } catch (err) {
    console.error('[Worker] Frame processing failed:', err);
  }
};
