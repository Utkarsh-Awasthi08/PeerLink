# PeerLink

[![Live App](https://img.shields.io/badge/Live_Demo-p2p--peer--link.vercel.app-2563eb?style=for-the-badge&logo=vercel&logoColor=white)](https://p2p-peer-link.vercel.app/)
[![Backend](https://img.shields.io/badge/Backend-Spring%20Boot%203-6DB33F?style=for-the-badge&logo=springboot&logoColor=white)](https://spring.io/projects/spring-boot)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)

> 🌐 **Live Website:** [https://p2p-peer-link.vercel.app](https://p2p-peer-link.vercel.app/)

PeerLink is a modern, serverless, peer-to-peer file-sharing web application. It enables users to securely share files of virtually unlimited size directly between browsers without storing any data on an intermediate server. 

By leveraging WebRTC for direct data streaming, native browser storage engines (**File System Access API** and **OPFS**), and native WebRTC DTLS/SCTP end-to-end encryption, PeerLink guarantees absolute privacy, lightning-fast transfer speeds, and zero server storage overhead.

---

## 🚀 Key Features

*   **Multi-File Batch Sharing & Dynamic Staging:** Drag and drop multiple files at once to generate a room. With **Dynamic File Adding**, senders can seamlessly click **"+ Add More Files"** during an active session to add new files on the fly without reconnecting.
*   **On-Demand "Pull" Architecture (Selective Downloads):** Unlike traditional push systems, the receiver sees the complete file manifest (names & sizes) and selectively chooses which files to download or can choose **"Download All"** to download the entire queue sequentially.
*   **Smart Transfer Queue & Cross-Browser Synchronization:**
    *   Clicking **"Get"** on multiple files or clicking **"Download All"** queues files sequentially.
    *   **Live Queue Syncing:** The receiver sees an amber **"🕒 In queue"** badge, while the sender's screen synchronizes in real-time displaying **"🕒 Next requested"** for queued files over WebRTC data channels.
    *   As soon as an active transfer completes, the next queued file starts automatically.
*   **In-Flight Transfer Cancellation:** Either the sender or receiver can abort an active file transfer at any time with a single click. The transfer cleanly halts, discards partial disk/RAM buffers, and allows remaining queued files to proceed without dropping the WebRTC peer connection.
*   **Stream-to-Disk via File System Access API (Desktop):** Supports streaming incoming WebRTC chunks directly to the recipient's hard drive in real time via `showSaveFilePicker`. Browser RAM usage stays flat at ~0 MB, eliminating browser crashes even when transferring multi-gigabyte or 100+ GB files.
*   **OPFS (Origin Private File System) Fallback (Mobile & Safari):** For browsers that do not support the File System Access API (iOS Safari, Android Chrome, Brave Shields), PeerLink streams chunks directly into the browser's hidden, sandboxed OPFS drive. Once complete, the file is seamlessly extracted to the user's Downloads folder without RAM crashes.
*   **Native End-to-End Encryption (E2EE):** Every data channel packet is inherently protected using **WebRTC DTLS** (Datagram Transport Layer Security) with SCTP. File content never passes through an intermediate server, and all cryptographic handshakes occur directly between browsers.
*   **Pause & Resume:** Transfers can be paused and resumed on the fly. The transfer loop pauses without dropping the WebRTC channel, maintaining sync between sender and receiver.
*   **Frictionless Sharing:** Instantly generate shareable links (e.g., `/d/12345`) and **QR Codes**. The receiver scans or opens the link to start downloading immediately.
*   **Real-Time Progress & Transfer Metrics:** Live transfer speeds (MB/s), ETA calculations, individual file progress bars, and transfer status indicators.
*   **Signaling Protection:** The Spring Boot backend uses **Bucket4j** token-bucket rate limiting to prevent signaling spam, combined with an aggressive **10-minute idle connection reaper** to keep backend memory footprint negligible.

---

## 🌊 Advanced Architecture (Under the Hood)

### 1. Receiver-Driven "Pull" Protocol & Dynamic Multiplexing
PeerLink operates on an on-demand pull model:
1. **Manifest Push & Dynamic Updates:** Upon WebRTC data channel establishment (`onopen`), the Sender sends a JSON `file_manifest`. Senders can stage new files mid-session; sending updated manifests over the open data channel without interrupting active binary chunk transfers.
2. **File Request & Live Queueing:** When the Receiver clicks **Get** (or queues files during **Download All**), subsequent requests emit a `queue_file` control message. The Sender's UI reflects "Next requested" in real-time while the Receiver displays "In queue".
3. **Chunk Streaming:** The Sender streams the requested file in 64 KB encrypted chunks until complete, followed by an `eof` message.
4. **Queue Advance:** The receiver locks its state synchronously to avoid concurrent stream collisions. When an `eof` is processed, the queue engine automatically pops the next file index and issues a `request_file`.
5. **In-Flight Cancellation:** Either peer can abort an active transfer via a `{ type: 'cancel', index }` control signal. The sender halts its chunk iteration, the receiver discards partial buffers, and the queue automatically transitions to the next item.

### 2. Zero-RAM Stream-to-Disk Architecture
Traditional browser file downloads accumulate chunks in JavaScript memory (`Blob` in RAM), which crashes mobile browsers at ~500 MB – 1 GB and desktop tabs on huge files. PeerLink solves this using a two-tier streaming disk strategy:

*   **Tier 1: Desktop Native Streaming (`showSaveFilePicker`)**
    *   Supported on Chromium browsers (Chrome, Edge, Opera).
    *   The user selects a destination on their hard drive upfront.
    *   Chunks are written directly to disk via `FileSystemWritableFileStream.write(chunk)`. Memory footprint is near 0 MB.
*   **Tier 2: Mobile & Safari Sandboxing (OPFS)**
    *   Supported on iOS Safari, Android Chrome, and privacy-shielded browsers like Brave.
    *   Chunks are written in real-time to the sandboxed Origin Private File System (`navigator.storage.getDirectory()`).
    *   At `eof`, a disk-backed `File` reference is handed to the browser download manager.
    *   Old OPFS temporary files are automatically cleaned up on session start to avoid consuming device storage.
*   **Tier 3: In-Memory Fallback**
    *   For legacy environments lacking OPFS, transfers gracefully fall back to in-memory buffering.

### 3. Backpressure Management & 64 KB Slicing
*   **Direct Slicing:** The sender slices chunks from the local `File` object using `file.slice()` without loading entire files into memory.
*   **Flow Control:** To prevent network buffer overflow, the sender monitors `RTCDataChannel.bufferedAmount`. If it exceeds a 1 MB high-water threshold, transmission pauses until the `onbufferedamountlow` event fires.

---

## 🏗️ System Architecture

PeerLink is split into a Next.js Frontend and a Spring Boot Backend. The backend acts **only** as an ephemeral WebRTC signaling server (exchanging SDP Offers, Answers, and ICE candidates). 

For horizontal scalability across multiple backend nodes, the signaling server uses **Upstash Redis Pub/Sub** to route signaling messages between peers connected to different server instances.

```mermaid
sequenceDiagram
    participant S as Sender (Browser)
    participant B as Signaling Server (Spring Boot)
    participant R as Redis (Upstash)
    participant C as Receiver (Browser)

    Note over S,C: 1. Signaling & WebRTC Negotiation
    S->>B: Connects via WS & Creates Room
    C->>B: Scans QR / Opens Link -> Joins Room
    B->>R: Routes Join Event via Redis Pub/Sub
    B->>S: Notifies Sender of Receiver
    S->>C: SDP Offer / Answer & ICE Exchange (via WS + Redis)
    Note over S,C: Direct WebRTC DataChannel Connected!

    Note over S,C: 2. Manifest Exchange & Dynamic Staging
    S->>C: Sends JSON file_manifest [File A, File B]
    opt Dynamic Adding
        S->>C: Sends updated file_manifest [File A, File B, File C]
    end
    
    Note over S,C: 3. Selective Streaming (Disk / OPFS)
    C->>C: Reserves space (Save As... dialog or OPFS sandbox)
    C->>S: Sends request_file (Index 0: File A)
    loop 64KB Encrypted Chunks
        S->>C: Binary Chunk via WebRTC DataChannel (DTLS Encrypted)
        C->>C: Write to Disk / OPFS Stream
    end
    S->>C: Sends { type: 'eof', index: 0 }
    C->>C: Closes stream, marks File A complete

    Note over S,C: 4. Queue Synchronization & Advancing
    C->>S: Sends queue_file (Index 1: File B) -> Sender marks "Next requested"
    C->>S: Sends request_file (Index 1: File B)
    Note over S,C: Repeats stream-to-disk loop for File B...
```

---

## 🛠️ Tech Stack

### Frontend
*   **Framework:** Next.js 16 (Turbopack) / React 19
*   **Styling:** Tailwind CSS v4
*   **P2P / Networking:** WebRTC (`RTCPeerConnection`, `RTCDataChannel`)
*   **Storage & Streaming:** File System Access API (`showSaveFilePicker`), Origin Private File System (OPFS)
*   **Security:** Native WebRTC DTLS / SCTP End-to-End Encryption
*   **UI Components:** `qrcode.react`, `react-icons`, `react-hot-toast`

### Backend
*   **Framework:** Java 17 + Spring Boot 3
*   **Real-time Protocol:** Spring WebSocket (TextWebSocketHandler)
*   **Message Broker:** Spring Data Redis Pub/Sub (Upstash Redis)
*   **Rate Limiting & Abuse Prevention:** Bucket4j
*   **Memory Management:** Aggressive 10-minute idle WebSocket pruning

---

## ⚡ Server Resource & Capacity Planning

Because PeerLink strictly routes data peer-to-peer and never buffers file bytes in memory, the signaling backend is highly optimized and exceptionally lightweight.

* **Base RAM:** The Spring Boot backend consumes ~200MB on startup.
* **Per-Connection Footprint:** Each idle WebSocket session takes merely ~100KB of heap.
* **Capacity Estimate:** On a standard **500MB RAM** free-tier instance (e.g., Render), the server comfortably sustains ~**3,000 simultaneous connections**.
* **Automatic Expiry:** To prevent memory leaks from forgotten tabs, the backend sweeps and forcefully expires idle WebSockets after a strict **10-minute limit**. WebRTC file transfers are completely unaffected by this signaling drop.

---

## ⚙️ Getting Started

### Prerequisites
*   Node.js (v18+)
*   Java 17+ and Maven
*   An [Upstash Redis](https://upstash.com/) instance (or local Redis)

### 1. Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd file_sharer_backend
   ```
2. Set your Redis credentials:
   ```bash
   export REDIS_URL="rediss://default:YOUR_PASSWORD@your-upstash-url.upstash.io:6379"
   ```
3. Run the Spring Boot application:
   ```bash
   mvn spring-boot:run
   ```
   *The signaling server starts on port `8080`.*

### 2. Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd file_sharer_frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create or verify `.env.local`:
   ```env
   NEXT_PUBLIC_WS_URL=ws://localhost:8080/signaling
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```
   *The application will be accessible at `http://localhost:3000`.*

---

## 🔒 Security Notice

PeerLink guarantees that **no file data ever touches our servers**:
* All files are transferred peer-to-peer directly between client browsers.
* The transfer tunnel is securely wrapped in **WebRTC DTLS** (the same military-grade encryption used in HTTPS).
* Even if the WebSocket connection drops or is forcefully expired by the server to save RAM, the underlying WebRTC tunnel remains unaffected, ensuring uninterrupted and secure file delivery.
