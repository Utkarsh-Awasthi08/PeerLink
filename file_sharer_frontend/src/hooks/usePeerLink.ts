import { useState, useRef, useCallback } from 'react';

type Role = 'sender' | 'receiver';

interface UsePeerLinkProps {
  role: Role;
  code?: string;
}

// ─── E2EE Helpers (Web Crypto API - AES-GCM) ────────────────────────────────

/** Generate a fresh AES-256-GCM key for this transfer session. */
async function generateKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

/** Export a CryptoKey to a URL-safe base64 string for embedding in the shareable link fragment. */
async function exportKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key);
  return btoa(String.fromCharCode(...new Uint8Array(raw)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/** Import a base64 key string back into a CryptoKey. */
async function importKey(b64: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(b64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/** Encrypt a single chunk (ArrayBuffer) with AES-GCM. Returns [iv || ciphertext] as one ArrayBuffer. */
async function encryptChunk(key: CryptoKey, data: ArrayBuffer): Promise<ArrayBuffer> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  // Prepend the 12-byte IV to the ciphertext so the receiver can use it to decrypt
  const combined = new Uint8Array(12 + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), 12);
  return combined.buffer;
}

/** Decrypt a single chunk (ArrayBuffer with prepended IV) with AES-GCM. */
async function decryptChunk(key: CryptoKey, data: ArrayBuffer): Promise<ArrayBuffer> {
  const iv = data.slice(0, 12);
  const ciphertext = data.slice(12);
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function usePeerLink({ role, code: initialCode }: UsePeerLinkProps) {
  const [code, setCode] = useState<string | null>(initialCode || null);
  const [encryptionKey, setEncryptionKey] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('Idle');
  const [progress, setProgress] = useState<number>(0);
  const [isPaused, setIsPaused] = useState(false);
  const [speedBytesPerSec, setSpeedBytesPerSec] = useState<number>(0);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const [receivedFile, setReceivedFile] = useState<{ blob: Blob; filename: string } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const cryptoKeyRef = useRef<CryptoKey | null>(null);

  // Transfer control
  const pausedRef = useRef(false);
  const resumeResolverRef = useRef<(() => void) | null>(null);

  // Speed tracking
  const transferStartRef = useRef<number>(0);
  const bytesAtLastTickRef = useRef<number>(0);
  const lastTickTimeRef = useRef<number>(0);
  const speedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Receive buffers
  const receiveBufferRef = useRef<ArrayBuffer[]>([]);
  const receivedSizeRef = useRef<number>(0);
  const expectedSizeRef = useRef<number>(0);
  const incomingFilenameRef = useRef<string>('download');

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

  /** Await this inside the sending loop to implement pause. */
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
        sendSignalingMessage({
          type: 'ice-candidate',
          code: sessionCode,
          role,
          payload: event.candidate,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      setStatus(`Connection: ${pc.connectionState}`);
    };

    return pc;
  }, [role, sendSignalingMessage]);

  // ── Speed ticker ─────────────────────────────────────────────────────────────

  const startSpeedTicker = useCallback((getBytesTransferred: () => number, getTotal: () => number) => {
    transferStartRef.current = Date.now();
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

  // ── Data Channel setup (shared for sender & receiver) ──────────────────────

  const setupDataChannel = useCallback((dc: RTCDataChannel) => {
    dc.binaryType = 'arraybuffer';

    dc.onopen = () => setStatus('Peer connected! Ready for transfer.');

    dc.onmessage = async (event) => {
      if (typeof event.data === 'string') {
        const meta = JSON.parse(event.data);

        if (meta.type === 'metadata') {
          incomingFilenameRef.current = meta.filename;
          expectedSizeRef.current = meta.size;
          receiveBufferRef.current = [];
          receivedSizeRef.current = 0;
          setStatus(`Receiving ${meta.filename}...`);
          startSpeedTicker(
            () => receivedSizeRef.current,
            () => expectedSizeRef.current,
          );
        } else if (meta.type === 'eof') {
          stopSpeedTicker();
          const blob = new Blob(receiveBufferRef.current);
          setReceivedFile({ blob, filename: incomingFilenameRef.current });
          setStatus('Transfer complete! ✅');
          setProgress(100);
        }
      } else {
        // Binary chunk — decrypt it first
        let chunk: ArrayBuffer = event.data;
        if (cryptoKeyRef.current) {
          chunk = await decryptChunk(cryptoKeyRef.current, chunk);
        }

        receiveBufferRef.current.push(chunk);
        receivedSizeRef.current += chunk.byteLength;
        const pct = Math.round((receivedSizeRef.current / expectedSizeRef.current) * 100);
        setProgress(pct);
      }
    };
  }, [startSpeedTicker, stopSpeedTicker]);

  // ── WebRTC flows ────────────────────────────────────────────────────────────

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

    // Set up encryption key
    if (role === 'sender') {
      // Generate a fresh key and export it for sharing
      const key = await generateKey();
      cryptoKeyRef.current = key;
      const exported = await exportKey(key);
      setEncryptionKey(exported);
    } else if (keyString) {
      // Receiver imports the key from the URL fragment
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

  // ── File sender ─────────────────────────────────────────────────────────────

  const sendFile = useCallback(async (file: File) => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== 'open') {
      setStatus('Data channel not ready. Please wait for your peer to connect.');
      return;
    }

    setStatus(`Sending ${file.name}...`);
    dc.send(JSON.stringify({ type: 'metadata', filename: file.name, size: file.size }));

    const CHUNK_SIZE = 64 * 1024; // 64 KB
    const LOW_WATERMARK = 1 * 1024 * 1024; // 1 MB backpressure threshold
    let offset = 0;
    let bytesSentRef = 0; // local mutable for the ticker closure

    // Start speed ticker using a local counter
    startSpeedTicker(() => bytesSentRef, () => file.size);

    while (offset < file.size) {
      // ── Pause support ──
      await waitIfPaused();

      // ── Backpressure support ──
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

      // ── E2EE Encrypt ──
      let chunk: ArrayBuffer = rawChunk;
      if (cryptoKeyRef.current) {
        chunk = await encryptChunk(cryptoKeyRef.current, rawChunk);
      }

      dc.send(chunk);
      offset += rawChunk.byteLength;
      bytesSentRef = offset;
      setProgress(Math.round((offset / file.size) * 100));
    }

    stopSpeedTicker();
    dc.send(JSON.stringify({ type: 'eof' }));
    setStatus('Sent successfully! ✅');
  }, [waitIfPaused, startSpeedTicker, stopSpeedTicker]);

  // ── Cleanup ─────────────────────────────────────────────────────────────────

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
    isPaused,
    speedBytesPerSec,
    etaSeconds,
    receivedFile,
    connect,
    sendFile,
    pause,
    resume,
    disconnect,
  };
}
