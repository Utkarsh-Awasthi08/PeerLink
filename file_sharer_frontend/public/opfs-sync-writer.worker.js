// Safari's OPFS implementation never added FileSystemFileHandle.createWritable().
// It only exposes createSyncAccessHandle(), which per spec is restricted to
// dedicated workers (synchronous file I/O is not allowed on the main thread) —
// and empirically, Safari also can't structured-clone a FileSystemFileHandle
// across postMessage ("The object can not be cloned"), so the main thread can't
// just hand this worker a handle it already opened. Instead we're given the
// file name and open OPFS ourselves, entirely inside this worker.
//
// Shipped as a static file (rather than bundled via `new Worker(new URL(...))`)
// so it doesn't depend on the app's bundler's worker-loader support.

let accessHandle = null;
let offset = 0;

self.onmessage = async (event) => {
  const msg = event.data;

  try {
    if (msg.type === 'init') {
      const root = await navigator.storage.getDirectory();
      const fileHandle = await root.getFileHandle(msg.fileName, { create: true });
      accessHandle = await fileHandle.createSyncAccessHandle();
      accessHandle.truncate(0);
      offset = 0;
      self.postMessage({ type: 'ready' });
    } else if (msg.type === 'write') {
      if (!accessHandle) throw new Error('Received a chunk before the OPFS access handle was ready');
      offset += accessHandle.write(msg.chunk, { at: offset });
    } else if (msg.type === 'close') {
      if (accessHandle) {
        accessHandle.flush();
        accessHandle.close();
        accessHandle = null;
      }
      self.postMessage({ type: 'closed' });
    } else if (msg.type === 'abort') {
      if (accessHandle) {
        try { accessHandle.close(); } catch (e) { /* ignore */ }
        accessHandle = null;
      }
      self.postMessage({ type: 'aborted' });
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: err && err.message ? err.message : String(err) });
  }
};
