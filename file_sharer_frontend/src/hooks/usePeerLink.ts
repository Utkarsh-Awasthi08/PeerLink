import { useState, useRef, useCallback } from 'react';

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
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function usePeerLink({ role, code: initialCode }: UsePeerLinkProps) {
  const [code, setCode] = useState<string | null>(initialCode || null);
  const [encryptionKey, setEncryptionKey] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('Idle');

  // Overall batch progress (0–100)
  const [progress, setProgress] = useState<number>(0);

  // Per-file progress state (for the queue list on the sender's UI)
  const [fileProgresses, setFileProgresses] = useState<number[]>([]);

  const [isPaused, setIsPaused] = useState(false);
  const [speedBytesPerSec, setSpeedBytesPerSec] = useState<number>(0);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);

  // Each time a file finishes on the receiver, this state is set so the UI
  // can trigger an auto-download. A new object reference fires the useEffect.
  const [receivedFile, setReceivedFile] = useState<ReceivedFile | null>(null);

  // Number of files in the batch (for display on the receiver side)
  const [totalFilesInBatch, setTotalFilesInBatch] = useState<number>(0);
  const [currentFileIndexInBatch, setCurrentFileIndexInBatch] = useState<number>(0);

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const cryptoKeyRef = useRef<CryptoKey | null>(null);

  // Transfer control
  const pausedRef = useRef(false);
  const resumeResolverRef = useRef<(() => void) | null>(null);

  // Speed tracking — scoped over the whole batch on the sender side
  const bytesAtLastTickRef = useRef<number>(0);
  const lastTickTimeRef = useRef<number>(0);
  const speedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Receive buffers (reset per file)
  const receiveBufferRef = useRef<ArrayBuffer[]>([]);
  const receivedSizeRef = useRef<number>(0);
  const expectedSizeRef = useRef<number>(0);
  const incomingFilenameRef = useRef<string>('download');

  // Batch-level byte counters on the receiver
  const batchTotalSizeRef = useRef<number>(0);
  const batchReceivedSizeRef = useRef<number>(0);

  const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080/signaling';

  // ── Pause / Resume ──────────────────────────────────────────────────────────

  const pause = useCallback(() => {
    pausedRef.current = true;
    setIsPaused(true);
    setStatus('Transfer paused');
  }, []);

  const resume = useCallback(() => {
    pausedRef.current = false;
    setIsPaused(false);
    if (resumeResolverRef.current) {
      resumeResolverRef.current();
      resumeResolverRef.current = null;
    }
    setStatus('Resuming transfer...');
  }, []);

  const waitIfPaused = useCallback(async () => {
    if (!pausedRef.current) return;
    await new Promise<void>((resolve) => {
      resumeResolverRef.current = resolve;
    });
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

      const remaining = getTotal() - transferred;
      setEtaSeconds(speed > 0 ? Math.ceil(remaining / speed) : null);
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

  // ── Data Channel setup (receiver) ────────────────────────────────────────────

  const setupDataChannel = useCallback((dc: RTCDataChannel) => {
    dc.binaryType = 'arraybuffer';
    dc.onopen = () => setStatus('Peer connected! Ready for transfer.');

    dc.onmessage = async (event) => {
      if (typeof event.data === 'string') {
        const meta = JSON.parse(event.data);

        if (meta.type === 'batch_start') {
          // Kick off batch-level speed tracking
          batchTotalSizeRef.current = meta.totalSizeBytes;
          batchReceivedSizeRef.current = 0;
          setTotalFilesInBatch(meta.totalFiles);
          setCurrentFileIndexInBatch(0);
          setProgress(0);
          startSpeedTicker(
            () => batchReceivedSizeRef.current,
            () => batchTotalSizeRef.current,
          );

        } else if (meta.type === 'metadata') {
          // New file starting — reset the per-file buffer
          incomingFilenameRef.current = meta.filename;
          expectedSizeRef.current = meta.size;
          receiveBufferRef.current = [];
          receivedSizeRef.current = 0;
          setCurrentFileIndexInBatch(meta.currentFileIndex);
          setStatus(`Receiving file ${meta.currentFileIndex + 1}/${meta.totalFiles}: ${meta.filename}`);

        } else if (meta.type === 'eof') {
          // One file done — trigger auto-download immediately
          const blob = new Blob(receiveBufferRef.current);
          setReceivedFile({ blob, filename: incomingFilenameRef.current });
          receiveBufferRef.current = []; // free memory
          setStatus(`File ${incomingFilenameRef.current} received ✅`);

        } else if (meta.type === 'batch_complete') {
          stopSpeedTicker();
          setProgress(100);
          setStatus('All files received! ✅');
        }

      } else {
        // Binary chunk — decrypt
        let chunk: ArrayBuffer = event.data;
        if (cryptoKeyRef.current) {
          chunk = await decryptChunk(cryptoKeyRef.current, chunk);
        }

        receiveBufferRef.current.push(chunk);
        receivedSizeRef.current += chunk.byteLength;
        batchReceivedSizeRef.current += chunk.byteLength;

        const pct = Math.round((batchReceivedSizeRef.current / batchTotalSizeRef.current) * 100);
        setProgress(pct);
      }
    };
  }, [startSpeedTicker, stopSpeedTicker]);

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
        setStatus('Disconnected: Rate limit exceeded. Please wait before retrying.');
      } else {
        setStatus('Disconnected.');
      }
    };
  }, [role, wsUrl, sendSignalingMessage, initiateWebRTC, handleOffer]);

  // ── Multi-file sender ────────────────────────────────────────────────────────

  const sendFiles = useCallback(async (files: File[]) => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== 'open') {
      setStatus('Data channel not ready. Please wait for your peer to connect.');
      return;
    }

    const CHUNK_SIZE = 64 * 1024;         // 64 KB
    const LOW_WATERMARK = 1 * 1024 * 1024; // 1 MB backpressure

    const totalSizeBytes = files.reduce((acc, f) => acc + f.size, 0);
    let batchBytesSent = 0;

    // Initialize per-file progress array
    setFileProgresses(new Array(files.length).fill(0));

    // 1. Announce the batch
    dc.send(JSON.stringify({ type: 'batch_start', totalFiles: files.length, totalSizeBytes }));

    // Start a single speed ticker over the entire batch
    startSpeedTicker(() => batchBytesSent, () => totalSizeBytes);

    // 2. Stream each file sequentially
    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      setStatus(`Sending file ${i + 1}/${files.length}: ${file.name}`);
      dc.send(JSON.stringify({
        type: 'metadata',
        filename: file.name,
        size: file.size,
        totalFiles: files.length,
        totalSizeBytes,
        currentFileIndex: i,
      }));

      let offset = 0;

      while (offset < file.size) {
        await waitIfPaused();

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
        batchBytesSent += rawChunk.byteLength;

        // Update per-file progress
        const filePct = Math.round((offset / file.size) * 100);
        setFileProgresses(prev => {
          const next = [...prev];
          next[i] = filePct;
          return next;
        });

        // Update overall batch progress
        const batchPct = Math.round((batchBytesSent / totalSizeBytes) * 100);
        setProgress(batchPct);
      }

      // Signal end of this file
      dc.send(JSON.stringify({ type: 'eof' }));
    }

    // 3. Signal end of batch
    stopSpeedTicker();
    dc.send(JSON.stringify({ type: 'batch_complete' }));
    setStatus(`All ${files.length} file${files.length > 1 ? 's' : ''} sent successfully! ✅`);
    setProgress(100);
  }, [waitIfPaused, startSpeedTicker, stopSpeedTicker]);

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
    speedBytesPerSec,
    etaSeconds,
    receivedFile,
    totalFilesInBatch,
    currentFileIndexInBatch,
    connect,
    sendFiles,
    pause,
    resume,
    disconnect,
  };
}
