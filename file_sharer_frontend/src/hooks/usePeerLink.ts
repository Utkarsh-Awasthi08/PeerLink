import { useState, useRef, useCallback, useEffect } from 'react';

type Role = 'sender' | 'receiver';

interface UsePeerLinkProps {
  role: Role;
  code?: string;
}

// ─── E2EE Helpers (Web Crypto API - AES-GCM) ────────────────────────────────

async function generateKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

async function exportKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key);
  return btoa(String.fromCharCode(...new Uint8Array(raw)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function importKey(b64: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(b64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encryptChunk(key: CryptoKey, data: ArrayBuffer): Promise<ArrayBuffer> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  const combined = new Uint8Array(12 + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), 12);
  return combined.buffer;
}

async function decryptChunk(key: CryptoKey, data: ArrayBuffer): Promise<ArrayBuffer> {
  const iv = data.slice(0, 12);
  const ciphertext = data.slice(12);
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ReceivedFile {
  blob: Blob;
  filename: string;
  index: number;
  handledByStream?: boolean;
}

export interface FileManifestItem {
  index: number;
  name: string;
  size: number;
}

interface FileSystemWritableStreamLike {
  write(data: ArrayBuffer | Uint8Array): Promise<void>;
  close(): Promise<void>;
}

interface FileSystemHandleLike {
  createWritable(): Promise<FileSystemWritableStreamLike>;
  getFile(): Promise<File>;
}

interface WindowWithFilePicker extends Window {
  showSaveFilePicker?: (options?: { suggestedName?: string }) => Promise<FileSystemHandleLike>;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function usePeerLink({ role, code: initialCode }: UsePeerLinkProps) {
  const [code, setCode] = useState<string | null>(initialCode || null);
  const [encryptionKey, setEncryptionKey] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('Idle');

  // Single file progress tracker (tracks whatever is currently streaming)
  const [progress, setProgress] = useState<number>(0);

  // Per-file sender progress tracking
  const [fileProgresses, setFileProgresses] = useState<Record<number, number>>({});

  const [isPaused, setIsPaused] = useState(false);
  const [speedBytesPerSec, setSpeedBytesPerSec] = useState<number>(0);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);

  // Pull / On-Demand specific state
  const [manifest, setManifest] = useState<FileManifestItem[]>([]);
  const manifestRef = useRef<FileManifestItem[]>([]);
  const [downloadingIndex, setDownloadingIndex] = useState<number | null>(null);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);

  // Auto-download trigger
  const [receivedFile, setReceivedFile] = useState<ReceivedFile | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const cryptoKeyRef = useRef<CryptoKey | null>(null);

  // Transfer control
  const pausedRef = useRef(false);
  const resumeResolverRef = useRef<(() => void) | null>(null);
  const stagedFilesRef = useRef<File[]>([]);
  const currentlyStreamingRef = useRef<number | null>(null);

  // Speed tracking
  const bytesAtLastTickRef = useRef<number>(0);
  const lastTickTimeRef = useRef<number>(0);
  const speedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Receive buffers (reset per file)
  const receiveBufferRef = useRef<ArrayBuffer[]>([]);
  const fileStreamRef = useRef<FileSystemWritableStreamLike | null>(null); // For File System Access API
  
  // OPFS
  const opfsFileHandleRef = useRef<FileSystemHandleLike | null>(null);
  const opfsWritableRef = useRef<FileSystemWritableStreamLike | null>(null);
  
  const receivedSizeRef = useRef<number>(0);
  const expectedSizeRef = useRef<number>(0);
  const incomingFilenameRef = useRef<string>('download');
  const incomingFileIndexRef = useRef<number>(-1);

  const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080/signaling';

  // ── Pause / Resume ──────────────────────────────────────────────────────────

  const pause = useCallback(() => {
    pausedRef.current = true;
    setIsPaused(true);
    setStatus('Transfer paused');
    
    // Notify receiver
    if (dcRef.current?.readyState === 'open') {
      dcRef.current.send(JSON.stringify({ type: 'pause' }));
    }
  }, []);

  const resume = useCallback(() => {
    pausedRef.current = false;
    setIsPaused(false);
    if (resumeResolverRef.current) {
      resumeResolverRef.current();
      resumeResolverRef.current = null;
    }
    setStatus(currentlyStreamingRef.current !== null ? 'Resuming transfer...' : 'Ready for transfer.');
    
    // Notify receiver
    if (dcRef.current?.readyState === 'open') {
      dcRef.current.send(JSON.stringify({ type: 'resume' }));
    }
  }, []);

  const waitIfPaused = useCallback(async () => {
    if (!pausedRef.current) return;
    await new Promise<void>((resolve) => {
      resumeResolverRef.current = resolve;
    });
  }, []);

  // Cleanup old OPFS files on mount
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.getDirectory) {
      navigator.storage.getDirectory().then(async (root) => {
        try {
          const rootWithEntries = root as unknown as { entries?: () => AsyncIterable<[string, unknown]> };
          if (rootWithEntries.entries) {
            for await (const [name] of rootWithEntries.entries()) {
              await root.removeEntry(name, { recursive: true }).catch(() => {});
            }
          }
        } catch {
          // Ignore
        }
      }).catch(() => {});
    }
  }, []);

  // ── Signaling helpers ───────────────────────────────────────────────────────

  const sendSignalingMessage = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const setupPeerConnection = useCallback((sessionCode: string) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });
    pcRef.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignalingMessage({ type: 'ice-candidate', code: sessionCode, role, payload: event.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      setStatus(`Connection: ${pc.connectionState}`);
    };

    return pc;
  }, [role, sendSignalingMessage]);

  // ── Speed ticker ─────────────────────────────────────────────────────────────

  const startSpeedTicker = useCallback((getBytesTransferred: () => number, getTotal: () => number) => {
    bytesAtLastTickRef.current = 0;
    lastTickTimeRef.current = Date.now();
    setProgress(0);
    setEtaSeconds(null);
    setSpeedBytesPerSec(0);

    if (speedIntervalRef.current) clearInterval(speedIntervalRef.current);
    speedIntervalRef.current = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - lastTickTimeRef.current) / 1000;
      const transferred = getBytesTransferred();
      const delta = transferred - bytesAtLastTickRef.current;
      const speed = elapsed > 0 ? delta / elapsed : 0;

      bytesAtLastTickRef.current = transferred;
      lastTickTimeRef.current = now;
      setSpeedBytesPerSec(speed);

      const total = getTotal();
      const remaining = total - transferred;
      setEtaSeconds(speed > 0 ? Math.ceil(remaining / speed) : null);
      if (total > 0) {
        setProgress(Math.round((transferred / total) * 100));
      }
    }, 1000);
  }, []);

  const stopSpeedTicker = useCallback(() => {
    if (speedIntervalRef.current) {
      clearInterval(speedIntervalRef.current);
      speedIntervalRef.current = null;
    }
    setSpeedBytesPerSec(0);
    setEtaSeconds(null);
  }, []);

  // ── Stream Single File (Sender) ──────────────────────────────────────────────
  
  const streamFile = useCallback(async (index: number) => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== 'open') return;

    const file = stagedFilesRef.current[index];
    if (!file) return;

    currentlyStreamingRef.current = index;
    setIsStreaming(true);
    setStatus(`Sending: ${file.name}...`);
    
    // Announce metadata
    dc.send(JSON.stringify({
      type: 'metadata',
      index: index,
      filename: file.name,
      size: file.size,
    }));

    const CHUNK_SIZE = 64 * 1024; // 64 KB
    const LOW_WATERMARK = 1 * 1024 * 1024; // 1 MB backpressure
    let offset = 0;
    let bytesSentRef = 0;

    startSpeedTicker(() => bytesSentRef, () => file.size);

    while (offset < file.size) {
      await waitIfPaused();

      // Ensure we haven't been asked to stream a different file abruptly
      if (currentlyStreamingRef.current !== index) {
        stopSpeedTicker();
        return;
      }

      if (dc.bufferedAmount > LOW_WATERMARK) {
        await new Promise<void>((resolve) => {
          dc.bufferedAmountLowThreshold = LOW_WATERMARK / 2;
          dc.onbufferedamountlow = () => {
            dc.onbufferedamountlow = null;
            resolve();
          };
        });
      }

      const slice = file.slice(offset, offset + CHUNK_SIZE);
      const rawChunk = await slice.arrayBuffer();

      let chunk: ArrayBuffer = rawChunk;
      if (cryptoKeyRef.current) {
        chunk = await encryptChunk(cryptoKeyRef.current, rawChunk);
      }

      dc.send(chunk);
      offset += rawChunk.byteLength;
      bytesSentRef = offset;

      // Update per-file sender UI progress
      const filePct = Math.round((offset / file.size) * 100);
      setFileProgresses(prev => ({ ...prev, [index]: filePct }));
    }

    stopSpeedTicker();
    dc.send(JSON.stringify({ type: 'eof', index }));
    currentlyStreamingRef.current = null;
    setIsStreaming(false);
    setStatus(`Waiting for peer to request a file...`);
  }, [waitIfPaused, startSpeedTicker, stopSpeedTicker]);

  // ── Data Channel setup ──────────────────────────────────────────────────────

  const setupDataChannel = useCallback((dc: RTCDataChannel) => {
    dc.binaryType = 'arraybuffer';
    
    dc.onopen = () => {
      setStatus('Peer connected! Ready for transfer.');
      
      // If Sender opens DC, automatically push the manifest
      if (role === 'sender' && stagedFilesRef.current.length > 0) {
        const manifestPayload = stagedFilesRef.current.map((f, i) => ({
          index: i, name: f.name, size: f.size
        }));
        dc.send(JSON.stringify({ type: 'file_manifest', manifest: manifestPayload }));
      }
    };

    dc.onmessage = async (event) => {
      if (typeof event.data === 'string') {
        const msg = JSON.parse(event.data);

        // -- Receiver handling --
        if (msg.type === 'file_manifest') {
          manifestRef.current = msg.manifest;
          setManifest(msg.manifest);
          setStatus('Ready to download.');
        } 
        else if (msg.type === 'metadata') {
          incomingFileIndexRef.current = msg.index;
          incomingFilenameRef.current = msg.filename;
          expectedSizeRef.current = msg.size;
          receiveBufferRef.current = [];
          receivedSizeRef.current = 0;
          setDownloadingIndex(msg.index);
          setStatus(`Receiving: ${msg.filename}...`);
          
          startSpeedTicker(
            () => receivedSizeRef.current,
            () => expectedSizeRef.current
          );
        } 
        else if (msg.type === 'eof') {
          stopSpeedTicker();
          
          if (fileStreamRef.current) {
            await fileStreamRef.current.close();
            fileStreamRef.current = null;
            setReceivedFile({ blob: new Blob([]), filename: incomingFilenameRef.current, index: msg.index, handledByStream: true });
          } else if (opfsWritableRef.current && opfsFileHandleRef.current) {
            await opfsWritableRef.current.close();
            opfsWritableRef.current = null;
            const file = await opfsFileHandleRef.current.getFile();
            setReceivedFile({ blob: file, filename: incomingFilenameRef.current, index: msg.index, handledByStream: false });
          } else {
            const blob = new Blob(receiveBufferRef.current);
            setReceivedFile({ blob, filename: incomingFilenameRef.current, index: msg.index, handledByStream: false });
            receiveBufferRef.current = [];
          }
          
          setDownloadingIndex(null);
          setStatus(`File received ✅`);
          setProgress(100);
        }
        else if (msg.type === 'pause') {
          setIsPaused(true);
          setStatus('Transfer paused by sender ⏸️');
        }
        else if (msg.type === 'resume') {
          setIsPaused(false);
          setStatus(incomingFileIndexRef.current !== -1 ? 'Resuming transfer...' : 'Ready to download.');
        }
        // -- Sender handling --
        else if (msg.type === 'request_file' && role === 'sender') {
          streamFile(msg.index);
        }

      } else {
        // Binary chunk — decrypt
        let chunk: ArrayBuffer = event.data;
        if (cryptoKeyRef.current) {
          chunk = await decryptChunk(cryptoKeyRef.current, chunk);
        }

        if (fileStreamRef.current) {
          await fileStreamRef.current.write(chunk);
          receivedSizeRef.current += chunk.byteLength;
        } else if (opfsWritableRef.current) {
          await opfsWritableRef.current.write(chunk);
          receivedSizeRef.current += chunk.byteLength;
        } else {
          receiveBufferRef.current.push(chunk);
          receivedSizeRef.current += chunk.byteLength;
        }
      }
    };
  }, [role, streamFile, startSpeedTicker, stopSpeedTicker]);

  // ── WebRTC negotiation ───────────────────────────────────────────────────────

  const initiateWebRTC = useCallback(async (sessionCode: string) => {
    const pc = setupPeerConnection(sessionCode);
    const dc = pc.createDataChannel('fileTransfer');
    dcRef.current = dc;
    setupDataChannel(dc);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSignalingMessage({ type: 'offer', code: sessionCode, role, payload: offer });
  }, [role, sendSignalingMessage, setupDataChannel, setupPeerConnection]);

  const handleOffer = useCallback(async (offer: RTCSessionDescriptionInit, sessionCode: string) => {
    const pc = setupPeerConnection(sessionCode);
    pc.ondatachannel = (event) => {
      dcRef.current = event.channel;
      setupDataChannel(event.channel);
    };

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    sendSignalingMessage({ type: 'answer', code: sessionCode, role, payload: answer });
  }, [role, sendSignalingMessage, setupDataChannel, setupPeerConnection]);

  // ── Main connect ────────────────────────────────────────────────────────────

  const connect = useCallback(async (sessionCode: string, keyString?: string) => {
    setCode(sessionCode);
    setStatus('Connecting to signaling server...');

    if (role === 'sender') {
      const key = await generateKey();
      cryptoKeyRef.current = key;
      const exported = await exportKey(key);
      setEncryptionKey(exported);
    } else if (keyString) {
      try {
        const key = await importKey(keyString);
        cryptoKeyRef.current = key;
      } catch {
        console.error('Failed to import encryption key. Transfer will be unencrypted.');
      }
    }

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('Connected. Waiting for peer...');
      sendSignalingMessage({ type: 'join', code: sessionCode, role });
    };

    ws.onmessage = async (event) => {
      const msg = JSON.parse(event.data);
      if (msg.code !== sessionCode) return;

      if (role === 'sender') {
        if (msg.type === 'join' && msg.role === 'receiver') {
          setStatus('Receiver joined! Creating offer...');
          await initiateWebRTC(sessionCode);
        } else if (msg.type === 'answer') {
          await pcRef.current?.setRemoteDescription(new RTCSessionDescription(msg.payload));
        } else if (msg.type === 'ice-candidate' && msg.payload) {
          await pcRef.current?.addIceCandidate(new RTCIceCandidate(msg.payload));
        }
      } else {
        if (msg.type === 'offer') {
          setStatus('Offer received. Connecting...');
          await handleOffer(msg.payload, sessionCode);
        } else if (msg.type === 'ice-candidate' && msg.payload) {
          await pcRef.current?.addIceCandidate(new RTCIceCandidate(msg.payload));
        }
      }
    };

    ws.onerror = () => setStatus('WebSocket error. Please retry.');
    ws.onclose = (e) => {
      if (e.code === 1008) {
        setStatus('Disconnected: Rate limit exceeded.');
      } else {
        setStatus('Disconnected.');
      }
    };
  }, [role, wsUrl, sendSignalingMessage, initiateWebRTC, handleOffer]);

  // ── Pull/On-Demand API ─────────────────────────────────────────────────────

  /** Sender saves files locally and pushes the manifest if connected */
  const shareFiles = useCallback((files: File[]) => {
    stagedFilesRef.current = files;
    
    // Reset file progresses
    const newProgresses: Record<number, number> = {};
    files.forEach((_, i) => newProgresses[i] = 0);
    setFileProgresses(newProgresses);

    const dc = dcRef.current;
    if (dc && dc.readyState === 'open') {
      const manifestPayload = files.map((f, i) => ({ index: i, name: f.name, size: f.size }));
      dc.send(JSON.stringify({ type: 'file_manifest', manifest: manifestPayload }));
      setStatus('Waiting for peer to request a file...');
    }
  }, []);

  /** Receiver requests a specific file from the sender */
  const requestFile = useCallback(async (index: number) => {
    const dc = dcRef.current;
    if (dc && dc.readyState === 'open') {
      const fileInfo = manifestRef.current.find(f => f.index === index);
      if (!fileInfo) return;

      setDownloadingIndex(index);

      const win = window as WindowWithFilePicker;
      if (typeof win.showSaveFilePicker === 'function') {
        try {
          const handle = await win.showSaveFilePicker({
            suggestedName: fileInfo.name,
          });
          const writable = await handle.createWritable();
          fileStreamRef.current = writable;
        } catch (err) {
          console.warn('Save prompt cancelled or failed.', err);
          setDownloadingIndex(null);
          return;
        }
      } else if (navigator.storage && navigator.storage.getDirectory) {
        try {
          const root = await navigator.storage.getDirectory();
          const handle = await root.getFileHandle(fileInfo.name, { create: true });
          const writable = await handle.createWritable();
          opfsFileHandleRef.current = handle;
          opfsWritableRef.current = writable;
          fileStreamRef.current = null;
        } catch (e) {
          console.warn('OPFS failed, falling back to RAM buffer', e);
          opfsFileHandleRef.current = null;
          opfsWritableRef.current = null;
          fileStreamRef.current = null;
          receiveBufferRef.current = [];
        }
      } else {
        fileStreamRef.current = null;
        opfsFileHandleRef.current = null;
        opfsWritableRef.current = null;
        receiveBufferRef.current = [];
      }

      dc.send(JSON.stringify({ type: 'request_file', index }));
    }
  }, []);

  // ── Cleanup ──────────────────────────────────────────────────────────────────

  const disconnect = useCallback(() => {
    stopSpeedTicker();
    wsRef.current?.close();
    dcRef.current?.close();
    pcRef.current?.close();
  }, [stopSpeedTicker]);

  return {
    code,
    encryptionKey,
    status,
    progress,
    fileProgresses,
    isPaused,
    isStreaming,
    speedBytesPerSec,
    etaSeconds,
    receivedFile,
    manifest,
    downloadingIndex,
    connect,
    shareFiles,
    requestFile,
    pause,
    resume,
    disconnect,
  };
}
