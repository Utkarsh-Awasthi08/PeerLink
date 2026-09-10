import { useState, useRef, useCallback, useEffect } from 'react';
import toast from 'react-hot-toast';

type Role = 'sender' | 'receiver';

interface UsePeerLinkProps {
  role: Role;
  code?: string;
}

// Single source of truth for room-code generation — also used internally to
// retry when the server reports a collision (see the 'code_taken' handling
// in connect() below).
export const generateCode = () => Math.floor(10000 + Math.random() * 90000).toString();

// ─── WebRTC Data Channels are E2E encrypted by default via DTLS ──────────────

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ReceivedFile {
  blob: Blob;
  filename: string;
  index: number;
  handledByStream?: boolean;
  cleanup?: () => void;
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
  const [status, setStatus] = useState<string>('Idle');

  // Single file progress tracker (tracks whatever is currently streaming)
  const [progress, setProgress] = useState<number>(0);

  // Per-file sender progress tracking
  const [fileProgresses, setFileProgresses] = useState<Record<number, number>>({});

  const [isPaused, setIsPaused] = useState(false);
  const [speedBytesPerSec, setSpeedBytesPerSec] = useState<number>(0);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);

  // True once the data channel is open; only goes false on a real (non-recovered) disconnect
  const [isPeerConnected, setIsPeerConnected] = useState(false);

  // Pull / On-Demand specific state
  const [manifest, setManifest] = useState<FileManifestItem[]>([]);
  const manifestRef = useRef<FileManifestItem[]>([]);
  const [downloadingIndex, setDownloadingIndex] = useState<number | null>(null);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);

  // Sender-side: track which file indices the receiver has queued (but not yet started)
  const [queuedFiles, setQueuedFiles] = useState<Set<number>>(new Set());
  const [completedFiles, setCompletedFiles] = useState<Set<number>>(new Set());

  // Auto-download trigger
  const [receivedFile, setReceivedFile] = useState<ReceivedFile | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const disconnectGraceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const codeRetriesRef = useRef(0); // sender: number of 'code_taken' retries for the current connect() call

  // Transfer control
  const pausedRef = useRef(false);
  const resumeResolverRef = useRef<(() => void) | null>(null);
  const cancelledRef = useRef(false);  // signals streamFile loop to abort
  const stagedFilesRef = useRef<File[]>([]);
  const currentlyStreamingRef = useRef<number | null>(null);
  // Synchronous mirror of downloadingIndex — the actual source of truth requestFile
  // uses to reserve a download slot. React state updates can lag behind an awaited
  // call by several renders; this ref cannot.
  const downloadingIndexRef = useRef<number | null>(null);

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
  const opfsWorkerRef = useRef<Worker | null>(null); // Safari path: writes go through a worker (see requestFile)

  const receivedSizeRef = useRef<number>(0);
  const expectedSizeRef = useRef<number>(0);
  const incomingFilenameRef = useRef<string>('download');
  const incomingFileIndexRef = useRef<number>(-1);
  const wakeLockRef = useRef<any>(null);

  const requestWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      }
    } catch (err) {
      // Ignore wake lock errors
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      } catch (err) {}
    }
  }, []);

  const terminateOpfsWorker = useCallback(() => {
    const worker = opfsWorkerRef.current;
    if (!worker) return;
    opfsWorkerRef.current = null;
    // Give the worker a chance to close its sync access handle before killing
    // it — terminate()-ing immediately can leave Safari's OPFS lock on the
    // file held indefinitely, which would hang a later attempt to reopen it.
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      worker.terminate();
    };
    worker.onmessage = finish;
    worker.onerror = finish;
    worker.postMessage({ type: 'abort' });
    setTimeout(finish, 2000);
  }, []);

  const removeOpfsFile = useCallback(async (name: string) => {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.getDirectory) {
      try {
        const root = await navigator.storage.getDirectory();
        await root.removeEntry(name);
      } catch {
        // Ignore — nothing to remove, or already gone
      }
    }
  }, []);

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
      // Ignore events from a superseded connection (e.g. a delayed 'closed'
      // firing after disconnect() already tore this one down to start a new
      // session) — otherwise it can stomp the new, actually-connected session's
      // isPeerConnected/status right after it's established.
      if (pcRef.current !== pc) return;
      const state = pc.connectionState;

      if (state === 'connected') {
        // Covers both the initial connect and recovering from a 'disconnected' blip.
        if (disconnectGraceTimerRef.current) {
          clearTimeout(disconnectGraceTimerRef.current);
          disconnectGraceTimerRef.current = null;
        }
        setIsPeerConnected(true);
        setStatus(prev => (prev === 'Peer disconnected. Connection lost.' ? 'Peer connected! Ready for transfer.' : prev));
        return;
      }

      if (state === 'disconnected') {
        // WebRTC's "disconnected" state is frequently a transient blip (Wi-Fi
        // roaming, a brief packet-loss spike) that self-heals back to
        // 'connected' within seconds — it is NOT the same as 'failed'. Give it
        // a grace period before treating the peer as actually gone, so we don't
        // flash a scary error (and hide transfer controls) for a hiccup that
        // resolves on its own.
        if (!disconnectGraceTimerRef.current) {
          disconnectGraceTimerRef.current = setTimeout(() => {
            disconnectGraceTimerRef.current = null;
            if (pcRef.current?.connectionState === 'disconnected') {
              setIsPeerConnected(false);
              setStatus('Peer disconnected. Connection lost.');
            }
          }, 6000);
        }
        return;
      }

      if (state === 'failed' || state === 'closed') {
        if (disconnectGraceTimerRef.current) {
          clearTimeout(disconnectGraceTimerRef.current);
          disconnectGraceTimerRef.current = null;
        }
        setIsPeerConnected(false);
        setStatus('Peer disconnected. Connection lost.');
      }
      // 'connecting' / 'new': no status change — avoids clobbering more specific in-progress text
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

    cancelledRef.current = false;          // reset cancellation flag for this transfer
    // A stale pause from an earlier (cancelled/disconnected) session must never
    // carry over — otherwise this transfer would silently block forever inside
    // waitIfPaused() with no visible way to resume (pause/cancel UI is hidden
    // until progress > 0, which never happens while stuck here).
    pausedRef.current = false;
    setIsPaused(false);
    currentlyStreamingRef.current = index;
    setIsStreaming(true);
    setStatus(`Sending: ${file.name}...`);
    requestWakeLock();
    
    // Announce metadata
    dc.send(JSON.stringify({
      type: 'metadata',
      index: index,
      filename: file.name,
      size: file.size,
    }));

    const CHUNK_SIZE = 256 * 1024; // 256 KB
    const LOW_WATERMARK = 8 * 1024 * 1024; // 8 MB backpressure
    let offset = 0;
    let bytesSentRef = 0;

    startSpeedTicker(() => bytesSentRef, () => file.size);

    while (offset < file.size) {
      await waitIfPaused();

      // Abort if cancelled externally
      if (cancelledRef.current) {
        stopSpeedTicker();
        dc.send(JSON.stringify({ type: 'cancel', index }));
        currentlyStreamingRef.current = null;
        setIsStreaming(false);
        setStatus('Transfer cancelled.');
        setFileProgresses(prev => ({ ...prev, [index]: 0 }));
        return;
      }

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

      let rawChunk: ArrayBuffer;
      try {
        const slice = file.slice(offset, offset + CHUNK_SIZE);
        rawChunk = await slice.arrayBuffer();
      } catch (err) {
        console.error('Error reading file chunk (file may have been deleted or modified):', err);
        stopSpeedTicker();
        dc.send(JSON.stringify({ type: 'cancel', index }));
        currentlyStreamingRef.current = null;
        setIsStreaming(false);
        setStatus('Error reading file. Transfer cancelled.');
        setFileProgresses(prev => ({ ...prev, [index]: 0 }));
        return;
      }

      let chunk: ArrayBuffer = rawChunk;

      dc.send(chunk);
      offset += rawChunk.byteLength;
      bytesSentRef = offset;

      // Update per-file sender UI progress
      const filePct = Math.round((offset / file.size) * 100);
      setFileProgresses(prev => ({ ...prev, [index]: filePct }));
    }

    stopSpeedTicker();
    releaseWakeLock();
    dc.send(JSON.stringify({ type: 'eof', index }));
    setCompletedFiles(prev => new Set(prev).add(index));
    currentlyStreamingRef.current = null;
    setIsStreaming(false);
    setStatus(`Waiting for peer to request a file...`);
  }, [waitIfPaused, startSpeedTicker, stopSpeedTicker]);

  // ── Data Channel setup ──────────────────────────────────────────────────────

  const setupDataChannel = useCallback((dc: RTCDataChannel) => {
    dc.binaryType = 'arraybuffer';
    
    dc.onopen = () => {
      setStatus('Peer connected! Ready for transfer.');
      setIsPeerConnected(true);

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
          // Defense-in-depth: only accept metadata for the file we actually
          // reserved via requestFile. A stray/duplicate 'metadata' for a
          // different index would otherwise silently repoint the shared
          // receive buffers/handles mid-transfer.
          if (downloadingIndexRef.current !== null && msg.index !== downloadingIndexRef.current) {
            console.warn(`Ignoring metadata for unexpected index ${msg.index} (expected ${downloadingIndexRef.current}).`);
            return;
          }
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
          // Defense-in-depth: ignore an eof that doesn't match the transfer we
          // actually have in progress, rather than closing/finalizing the
          // wrong file's shared buffer/handle.
          if (msg.index !== incomingFileIndexRef.current) {
            console.warn(`Ignoring eof for unexpected index ${msg.index} (expected ${incomingFileIndexRef.current}).`);
            return;
          }
          stopSpeedTicker();
          releaseWakeLock();

          if (fileStreamRef.current) {
            await fileStreamRef.current.close();
            fileStreamRef.current = null;
            setReceivedFile({ blob: new Blob([]), filename: incomingFilenameRef.current, index: msg.index, handledByStream: true });
          } else if (opfsFileHandleRef.current && (opfsWritableRef.current || opfsWorkerRef.current)) {
            if (opfsWritableRef.current) {
              await opfsWritableRef.current.close();
              opfsWritableRef.current = null;
            } else if (opfsWorkerRef.current) {
              const worker = opfsWorkerRef.current;
              await new Promise<void>((resolve, reject) => {
                worker.onmessage = (e) => {
                  if (e.data?.type === 'closed') resolve();
                  else if (e.data?.type === 'error') reject(new Error(e.data.message));
                };
                worker.postMessage({ type: 'close' });
              });
              worker.terminate();
              opfsWorkerRef.current = null;
            }
            const file = await opfsFileHandleRef.current.getFile();
            const fileNameToRemove = incomingFilenameRef.current;
            const opfsCleanup = () => {
              if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.getDirectory) {
                navigator.storage.getDirectory().then(root => {
                  root.removeEntry(fileNameToRemove).catch(() => {});
                }).catch(() => {});
              }
            };
            setReceivedFile({ blob: file, filename: incomingFilenameRef.current, index: msg.index, handledByStream: false, cleanup: opfsCleanup });
            opfsFileHandleRef.current = null;
          } else {
            const blob = new Blob(receiveBufferRef.current);
            setReceivedFile({ blob, filename: incomingFilenameRef.current, index: msg.index, handledByStream: false });
            receiveBufferRef.current = [];
          }
          
          downloadingIndexRef.current = null;
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
        // cancel sent by the OTHER side
        else if (msg.type === 'cancel') {
          if (role === 'receiver') {
            // Ignore a stray/late cancel that doesn't refer to the transfer
            // we're actually receiving — otherwise it could wrongly tear down
            // a different, still-active download.
            if (msg.index !== incomingFileIndexRef.current) return;
            stopSpeedTicker();
            releaseWakeLock();
            // Peer (sender) cancelled — discard any partial data we received
            receiveBufferRef.current = [];
            receivedSizeRef.current = 0;
            if (fileStreamRef.current) {
              try { await fileStreamRef.current.close(); } catch { /* ignore */ }
              fileStreamRef.current = null;
            }
            let hadOpfsFile = false;
            if (opfsWritableRef.current) {
              try { await opfsWritableRef.current.close(); } catch { /* ignore */ }
              opfsWritableRef.current = null;
              opfsFileHandleRef.current = null;
              hadOpfsFile = true;
            }
            if (opfsWorkerRef.current) {
              terminateOpfsWorker();
              opfsFileHandleRef.current = null;
              hadOpfsFile = true;
            }
            // Delete the partial OPFS entry rather than leaving it orphaned —
            // an un-cleaned partial file with the same name can otherwise block
            // (or get silently reused by) a later attempt to download it again.
            if (hadOpfsFile) removeOpfsFile(incomingFilenameRef.current);
            downloadingIndexRef.current = null;
            setDownloadingIndex(null);
            setProgress(0);
            setStatus('Transfer cancelled by sender.');
          } else {
            // Ignore a stray/late cancel that doesn't refer to the file we're
            // actually streaming — otherwise it could wrongly abort a
            // different, newer transfer.
            if (msg.index !== currentlyStreamingRef.current) return;
            stopSpeedTicker();
            releaseWakeLock();
            // Peer (receiver) cancelled — stop our streaming loop
            cancelledRef.current = true;
            // If paused, unblock the pause-wait so the cancel check triggers immediately
            if (resumeResolverRef.current) {
              resumeResolverRef.current();
              resumeResolverRef.current = null;
            }
          }
        }
        // -- Sender handling --
        else if (msg.type === 'request_file' && role === 'sender') {
          // Defense-in-depth: with the receiver-side reservation in requestFile,
          // two overlapping request_file messages should never happen in normal
          // operation — but if one ever does, ignoring it (rather than clobbering
          // currentlyStreamingRef and silently orphaning the in-flight file) keeps
          // a stray message from wedging an active transfer.
          if (currentlyStreamingRef.current !== null) {
            console.warn(`Ignoring request_file for index ${msg.index}: index ${currentlyStreamingRef.current} is already streaming.`);
            return;
          }
          // Remove from queued set when the actual transfer begins
          setQueuedFiles(prev => {
            const next = new Set(prev);
            next.delete(msg.index);
            return next;
          });
          streamFile(msg.index);
        }
        else if (msg.type === 'queue_file' && role === 'sender') {
          // Receiver is signalling this file is in their local queue
          setQueuedFiles(prev => new Set(prev).add(msg.index));
        }

      } else {
        let chunk: ArrayBuffer = event.data;

        if (fileStreamRef.current) {
          await fileStreamRef.current.write(chunk);
          receivedSizeRef.current += chunk.byteLength;
        } else if (opfsWorkerRef.current) {
          const len = chunk.byteLength;
          opfsWorkerRef.current.postMessage({ type: 'write', chunk }, [chunk]);
          receivedSizeRef.current += len;
        } else if (opfsWritableRef.current) {
          await opfsWritableRef.current.write(chunk);
          receivedSizeRef.current += chunk.byteLength;
        } else {
          receiveBufferRef.current.push(chunk);
          receivedSizeRef.current += chunk.byteLength;
        }
      }
    };
  }, [role, streamFile, startSpeedTicker, stopSpeedTicker, releaseWakeLock, terminateOpfsWorker, removeOpfsFile]);

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

  const connect = useCallback(async (sessionCode: string) => {
    setCode(sessionCode);
    setStatus('Connecting to signaling server...');
    setIsPeerConnected(false);
    codeRetriesRef.current = 0;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    let connectionTimeout: ReturnType<typeof setTimeout>;

    ws.onopen = () => {
      setStatus('Connected. Waiting for peer...');
      sendSignalingMessage({ type: 'join', code: sessionCode, role });

      if (role === 'receiver') {
        // If sender doesn't exist, we won't get an offer. Time out after 10 seconds.
        connectionTimeout = setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            setStatus('No peer found for this code.');
            ws.close();
          }
        }, 10000);
      }
    };

    ws.onmessage = async (event) => {
      const msg = JSON.parse(event.data);
      if (msg.code !== sessionCode) return;

      if (role === 'sender') {
        if (msg.type === 'code_taken') {
          // The server already has an active sender on this code (~1-in-90,000
          // odds, but with enough concurrent users it happens) — generate a
          // different one and retry over the same still-open WebSocket rather
          // than silently colliding with that other session.
          if (codeRetriesRef.current >= 5) {
            setStatus('Could not find an available room code. Please try again.');
            ws.close();
            return;
          }
          codeRetriesRef.current += 1;
          sessionCode = generateCode();
          setCode(sessionCode);
          sendSignalingMessage({ type: 'join', code: sessionCode, role });
        } else if (msg.type === 'join' && msg.role === 'receiver') {
          setStatus('Receiver joined! Creating offer...');
          await initiateWebRTC(sessionCode);
        } else if (msg.type === 'answer') {
          await pcRef.current?.setRemoteDescription(new RTCSessionDescription(msg.payload));
        } else if (msg.type === 'ice-candidate' && msg.payload) {
          await pcRef.current?.addIceCandidate(new RTCIceCandidate(msg.payload));
        }
      } else {
        if (msg.type === 'offer') {
          if (connectionTimeout) clearTimeout(connectionTimeout);
          setStatus('Offer received. Connecting...');
          await handleOffer(msg.payload, sessionCode);
        } else if (msg.type === 'ice-candidate' && msg.payload) {
          await pcRef.current?.addIceCandidate(new RTCIceCandidate(msg.payload));
        }
      }
    };

    ws.onerror = () => {
      // Once the real P2P data channel is open, the signaling socket is no longer
      // load-bearing — an error on it now doesn't mean the transfer is broken.
      if (dcRef.current?.readyState === 'open') return;
      setStatus(prev => prev.includes('No peer found') ? prev : 'WebSocket error. Please retry.');
    };
    ws.onclose = (e) => {
      setStatus(prev => {
        if (prev === 'No peer found for this code.') return prev;
        // The signaling socket only brokers the offer/answer/ICE exchange — once
        // the actual WebRTC data channel is open, losing it is expected (the
        // backend also proactively closes signaling sessions, e.g. its rate
        // limiter tripping on a burst of trickled ICE candidates), not a sign the
        // transfer died. Without this check, a signaling-only closure would read
        // as "Disconnected" and kick the user back to the homepage mid-transfer.
        if (dcRef.current?.readyState === 'open') return prev;
        if (e.code === 1008) return 'Disconnected: Rate limit exceeded.';
        return 'Disconnected.';
      });
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
    setCompletedFiles(new Set());

    const dc = dcRef.current;
    if (dc && dc.readyState === 'open') {
      const manifestPayload = files.map((f, i) => ({ index: i, name: f.name, size: f.size }));
      dc.send(JSON.stringify({ type: 'file_manifest', manifest: manifestPayload }));
      setStatus('Waiting for peer to request a file...');
    }
  }, []);

  /**
   * Sender dynamically appends more files to the live session.
   * Sends an updated manifest over the open DataChannel — safe even mid-transfer
   * because the DataChannel already separates JSON strings from binary chunks.
   */
  const addFiles = useCallback((newFiles: File[]) => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== 'open') return;

    // Deduplicate by name+size against already-staged files
    const existing = new Set(stagedFilesRef.current.map(f => `${f.name}-${f.size}`));
    const unique = newFiles.filter(f => !existing.has(`${f.name}-${f.size}`));
    if (unique.length === 0) return;

    // Append to staged files — new files get indices starting from current length
    const startIndex = stagedFilesRef.current.length;
    stagedFilesRef.current = [...stagedFilesRef.current, ...unique];

    // Initialise progress entries for the new files
    setFileProgresses(prev => {
      const next = { ...prev };
      unique.forEach((_, i) => { next[startIndex + i] = 0; });
      return next;
    });

    // Broadcast the full updated manifest to the receiver
    const manifestPayload = stagedFilesRef.current.map((f, i) => ({ index: i, name: f.name, size: f.size }));
    dc.send(JSON.stringify({ type: 'file_manifest', manifest: manifestPayload }));
  }, []);

  /** Receiver signals to Sender that a file is queued (not yet requested) */
  const sendQueueSignal = useCallback((index: number) => {
    const dc = dcRef.current;
    if (dc && dc.readyState === 'open') {
      dc.send(JSON.stringify({ type: 'queue_file', index }));
    }
  }, []);

  /** Cancel the currently active transfer (works on both sender and receiver) */
  const cancelTransfer = useCallback(() => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== 'open') return;

    if (role === 'sender') {
      // Signal the streaming loop to stop
      cancelledRef.current = true;
      pausedRef.current = false;
      setIsPaused(false);
      // Unblock if currently paused so the cancel flag is checked immediately
      if (resumeResolverRef.current) {
        resumeResolverRef.current();
        resumeResolverRef.current = null;
      }
      // Note: the streamFile loop itself will send the 'cancel' msg to the receiver
    } else {
      // Receiver side: discard partial data and notify sender
      stopSpeedTicker();
      setIsPaused(false);
      receiveBufferRef.current = [];
      receivedSizeRef.current = 0;
      if (fileStreamRef.current) {
        fileStreamRef.current.close().catch(() => {});
        fileStreamRef.current = null;
      }
      let hadOpfsFile = false;
      if (opfsWritableRef.current) {
        opfsWritableRef.current.close().catch(() => {});
        opfsWritableRef.current = null;
        opfsFileHandleRef.current = null;
        hadOpfsFile = true;
      }
      if (opfsWorkerRef.current) {
        terminateOpfsWorker();
        opfsFileHandleRef.current = null;
        hadOpfsFile = true;
      }
      // Delete the partial OPFS entry — otherwise it's left orphaned and can
      // block (or get confusingly reused by) a later attempt at this same file.
      if (hadOpfsFile) removeOpfsFile(incomingFilenameRef.current);
      downloadingIndexRef.current = null;
      setDownloadingIndex(null);
      setProgress(0);
      setStatus('Transfer cancelled.');
      dc.send(JSON.stringify({ type: 'cancel', index: incomingFileIndexRef.current }));
    }
  }, [role, stopSpeedTicker, terminateOpfsWorker, removeOpfsFile]);

  /** Receiver requests a specific file from the sender */
  const requestFile = useCallback(async (index: number) => {
    // Synchronous re-entrancy guard: rejects a second call (the queue-draining
    // effect firing again before this call's own reservation commits, a double
    // click on "Get", a second "Download All" click) regardless of React render
    // timing, since this check and the reservation below run before any await.
    if (downloadingIndexRef.current !== null) return;
    const dc = dcRef.current;
    if (dc && dc.readyState === 'open') {
      const fileInfo = manifestRef.current.find(f => f.index === index);
      if (!fileInfo) return;

      // Reserve the slot synchronously, before the first await below — this lands
      // in the same React batch as the caller's own state update (e.g. the queue
      // effect's setDownloadQueue), closing the window where downloadingIndex
      // would otherwise stay null across several renders while
      // navigator.storage.estimate() (a real IPC round-trip) is still pending.
      downloadingIndexRef.current = index;
      setDownloadingIndex(index);

      if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
        try {
          const { quota, usage } = await navigator.storage.estimate();
          const available = (quota ?? 0) - (usage ?? 0);
          if (fileInfo.size > available) {
            toast.error("Not enough disk space available for this download!");
            downloadingIndexRef.current = null;
            setDownloadingIndex(null);
            return;
          }
        } catch (err) {
          // Ignore estimation errors
        }
      }

      requestWakeLock();

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
          downloadingIndexRef.current = null;
          setDownloadingIndex(null);
          return;
        }
      } else if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.getDirectory) {
        try {
          const root = await navigator.storage.getDirectory();
          const handle = (await root.getFileHandle(fileInfo.name, { create: true })) as unknown as FileSystemHandleLike;

          if (typeof handle.createWritable === 'function') {
            // Chromium: async writable stream works directly on the main thread.
            const writable = await handle.createWritable();
            opfsFileHandleRef.current = handle;
            opfsWritableRef.current = writable;
            fileStreamRef.current = null;
          } else {
            // Safari: no createWritable(), and createSyncAccessHandle() is only
            // reachable from inside a worker — Safari also can't structured-clone
            // a FileSystemFileHandle across postMessage, so the worker opens the
            // OPFS file itself by name rather than receiving this handle.
            const worker = new Worker('/opfs-sync-writer.worker.js');
            await new Promise<void>((resolve, reject) => {
              worker.onmessage = (e) => {
                if (e.data?.type === 'ready') resolve();
                else if (e.data?.type === 'error') reject(new Error(e.data.message));
              };
              worker.onerror = () => reject(new Error('OPFS worker failed to start'));
              worker.postMessage({ type: 'init', fileName: fileInfo.name });
            });
            opfsWorkerRef.current = worker;
            opfsFileHandleRef.current = handle;
            opfsWritableRef.current = null;
            fileStreamRef.current = null;
            // The init-phase handler above only matters until 'ready'/'error' —
            // its resolve/reject already fired, so replace it before any chunk
            // writes start. Otherwise a write error mid-transfer posts 'error'
            // into a dead, already-settled promise and vanishes silently,
            // leaving the UI stuck at 0% forever with no feedback.
            worker.onmessage = (e) => {
              if (e.data?.type !== 'error') return;
              console.error('OPFS worker write error:', e.data.message);
              toast.error('Download failed — could not write to storage.');
              terminateOpfsWorker();
              opfsFileHandleRef.current = null;
              stopSpeedTicker();
              releaseWakeLock();
              downloadingIndexRef.current = null;
              setDownloadingIndex(null);
              setProgress(0);
              setStatus('Download failed.');
              if (dcRef.current?.readyState === 'open') {
                dcRef.current.send(JSON.stringify({ type: 'cancel', index: incomingFileIndexRef.current }));
              }
            };
          }
        } catch (err) {
          console.warn('OPFS failed, falling back to RAM buffer', err);
          terminateOpfsWorker();
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
  }, [requestWakeLock, terminateOpfsWorker, stopSpeedTicker, releaseWakeLock]);

  // ── Cleanup ──────────────────────────────────────────────────────────────────

  const disconnect = useCallback(() => {
    stopSpeedTicker();
    releaseWakeLock();
    if (disconnectGraceTimerRef.current) {
      clearTimeout(disconnectGraceTimerRef.current);
      disconnectGraceTimerRef.current = null;
    }
    // Best-effort: tell the peer we're leaving *before* tearing the channel
    // down, so it cleans up (closes/deletes any in-progress OPFS write, resets
    // its UI) instead of being left waiting forever for chunks/eof that will
    // never arrive — e.g. "Cancel & Start Over" used to just vanish, leaving
    // the other side stuck showing "Receiving..."/"Sending..." at 0% forever.
    if (dcRef.current?.readyState === 'open') {
      try { dcRef.current.send(JSON.stringify({ type: 'cancel', index: currentlyStreamingRef.current ?? incomingFileIndexRef.current })); } catch { /* ignore */ }
    }
    pausedRef.current = false;
    setIsPaused(false);
    if (resumeResolverRef.current) {
      resumeResolverRef.current();
      resumeResolverRef.current = null;
    }
    wsRef.current?.close();
    dcRef.current?.close();
    pcRef.current?.close();
    setCompletedFiles(new Set());
    setIsPeerConnected(false);
  }, [stopSpeedTicker]);

  return {
    code,
    status,
    progress,
    fileProgresses,
    queuedFiles,
    isPeerConnected,
    completedFiles,
    isPaused,
    isStreaming,
    speedBytesPerSec,
    etaSeconds,
    receivedFile,
    manifest,
    downloadingIndex,
    connect,
    shareFiles,
    addFiles,
    sendQueueSignal,
    cancelTransfer,
    requestFile,
    pause,
    resume,
    disconnect,
  };
}
