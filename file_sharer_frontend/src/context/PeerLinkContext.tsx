'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from 'react';
import toast from 'react-hot-toast';
import { usePeerLink, generateCode, type ReceivedFile, type FileManifestItem } from '@/hooks/usePeerLink';

// ─── Re-export types that page.tsx and mini-player need ──────────────────────
export type { ReceivedFile, FileManifestItem };

// ─── Context shape ────────────────────────────────────────────────────────────

type PeerLinkHookReturn = ReturnType<typeof usePeerLink>;

interface PeerLinkContextValue {
  // The two live hook instances — everything inside survives navigation
  sender: PeerLinkHookReturn;
  receiver: PeerLinkHookReturn;

  // Page-local UI state that MUST survive navigation so the transfer card
  // is fully restored when the user returns to "/"
  selectedFiles: File[];
  setSelectedFiles: Dispatch<SetStateAction<File[]>>;
  isSharing: boolean;
  setIsSharing: Dispatch<SetStateAction<boolean>>;
  activeTab: 'upload' | 'download';
  setActiveTab: Dispatch<SetStateAction<'upload' | 'download'>>;

  // Convenience handlers (extracted from Home() so page.tsx stays thin)
  handleFilesSelected: (files: File[]) => void;
  handleShare: () => void;
  handleCancelShare: () => void;
  handleAddMoreFiles: (files: File[]) => void;
  /** Sender: evict current receiver, keep same room code. Files stay staged. */
  handleDisconnectPeer: () => void;
  /** Sender: evict current receiver AND rotate to a fresh room code. Files stay staged. */
  handleKickAndRefresh: () => void;
}

// ─── Context creation ─────────────────────────────────────────────────────────

const PeerLinkContext = createContext<PeerLinkContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function PeerLinkProvider({ children }: { children: ReactNode }) {
  // ── Both hook instances live here — never unmounted ──────────────────────
  const sender   = usePeerLink({ role: 'sender' });
  const receiver = usePeerLink({ role: 'receiver' });

  // ── UI state that must survive navigation ────────────────────────────────
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isSharing,     setIsSharing]     = useState(false);
  const [activeTab,     setActiveTab]     = useState<'upload' | 'download'>('upload');

  // Keep a stable ref to sender so the beforeunload handler below doesn't
  // capture a stale closure over the very first render's sender object.
  const senderRef   = useRef(sender);
  const receiverRef = useRef(receiver);
  senderRef.current   = sender;
  receiverRef.current = receiver;

  // ── Auto-download: fires whenever receiver completes a file ──────────────
  // Moved from page.tsx so it works even when the user is on /about, /faq, etc.
  useEffect(() => {
    if (!receiver.receivedFile) return;
    const { blob, filename, handledByStream, cleanup } = receiver.receivedFile;

    // Files handled by the streaming path (showSaveFilePicker / OPFS) already
    // triggered their own save dialog — don't double-fire a createObjectURL link.
    if (!handledByStream) {
      const url  = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href     = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }

    toast.success(`Downloaded "${filename}" ✅`);
    cleanup?.();
  }, [receiver.receivedFile]);

  // ── Cleanup on browser tab close / refresh ───────────────────────────────
  // When the user actually closes the tab we do want to tear down connections
  // gracefully so the peer doesn't get stuck mid-transfer with no explanation.
  useEffect(() => {
    const onUnload = () => {
      senderRef.current.disconnect();
      receiverRef.current.disconnect();
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, []);

  // ── Convenience handlers ─────────────────────────────────────────────────

  const handleFilesSelected = useCallback((files: File[]) => {
    setSelectedFiles(prev => {
      const existing = new Set(prev.map(f => `${f.name}-${f.size}`));
      return [...prev, ...files.filter(f => !existing.has(`${f.name}-${f.size}`))];
    });
  }, []);

  const handleShare = useCallback(() => {
    setSelectedFiles(prev => {
      if (prev.length === 0) return prev;
      setIsSharing(true);
      senderRef.current.connect(generateCode());
      return prev;
    });
  }, []);

  const handleCancelShare = useCallback(() => {
    senderRef.current.disconnect();
    setIsSharing(false);
    setSelectedFiles([]);
  }, []);

  const handleAddMoreFiles = useCallback((files: File[]) => {
    if (files.length === 0) return;
    setSelectedFiles(prev => {
      const existing = new Set(prev.map(f => `${f.name}-${f.size}`));
      return [...prev, ...files.filter(f => !existing.has(`${f.name}-${f.size}`))];
    });
    senderRef.current.addFiles(files);
  }, []);

  const handleDisconnectPeer = useCallback(() => {
    senderRef.current.disconnectPeer(false);
  }, []);

  const handleKickAndRefresh = useCallback(() => {
    senderRef.current.disconnectPeer(true);
  }, []);

  // ── Auto-share when peer connects ────────────────────────────────────────
  // Previously this was a useEffect watching sender.status inside Home().
  // It must live here because Home() may be unmounted when the status changes.
  const prevStatusRef = useRef('');
  useEffect(() => {
    const { status } = sender;
    if (
      status === 'Peer connected! Ready for transfer.' &&
      prevStatusRef.current !== status &&
      isSharing &&
      selectedFiles.length > 0
    ) {
      toast.success('Peer connected! Waiting for receiver to request files...');
      sender.shareFiles(selectedFiles);
    }
    prevStatusRef.current = status;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sender.status]);

  return (
    <PeerLinkContext.Provider
      value={{
        sender,
        receiver,
        selectedFiles,
        setSelectedFiles,
        isSharing,
        setIsSharing,
        activeTab,
        setActiveTab,
        handleFilesSelected,
        handleShare,
        handleCancelShare,
        handleAddMoreFiles,
        handleDisconnectPeer,
        handleKickAndRefresh,
      }}
    >
      {children}
    </PeerLinkContext.Provider>
  );
}

// ─── Consumer hook ────────────────────────────────────────────────────────────

export function usePeerLinkContext(): PeerLinkContextValue {
  const ctx = useContext(PeerLinkContext);
  if (!ctx) {
    throw new Error('usePeerLinkContext must be used inside <PeerLinkProvider>');
  }
  return ctx;
}
