# PeerLink

PeerLink is a modern, serverless, peer-to-peer file-sharing web application. It enables users to securely share files of virtually unlimited size directly between browsers without storing any data on an intermediate server. 

By leveraging WebRTC for direct data streaming, native browser storage engines (**File System Access API** and **OPFS**), and the Web Crypto API for End-to-End Encryption, PeerLink guarantees absolute privacy, lightning-fast transfer speeds, and zero server storage overhead.

---

## 🚀 Key Features

*   **Multi-File Batch Sharing:** Drag and drop multiple files at once. The sender stages the files, generates a single room link/QR code, and broadcasts a manifest to the receiver.
*   **On-Demand "Pull" Architecture (Selective Downloads):** Unlike traditional push systems, the receiver sees the complete file manifest (names & sizes) and selectively chooses which files to download or can choose **"Download All"** to download the entire queue sequentially.
*   **Stream-to-Disk via File System Access API (Desktop):** Supports streaming incoming WebRTC chunks directly to the recipient's hard drive in real time via `showSaveFilePicker`. Browser RAM usage stays flat at ~0 MB, eliminating browser crashes even when transferring multi-gigabyte or 100+ GB files.
*   **OPFS (Origin Private File System) Fallback (Mobile & Safari):** For browsers that do not support the File System Access API (iOS Safari, Android Chrome, Brave Shields), PeerLink streams chunks directly into the browser's hidden, sandboxed OPFS drive. Once complete, the file is seamlessly extracted to the user's Downloads folder without RAM crashes.
*   **End-to-End Encryption (E2EE):** Every file chunk is encrypted client-side using **AES-256-GCM** before transmission. The decryption key is embedded solely in the URL hash fragment (`#key`) and is never transmitted to the signaling server.
*   **Sequential Queue & Re-downloading:** Automatic queue locking prevents race conditions and network choking during batch transfers. Individual files can be re-downloaded at any time, or the entire batch can be re-queued with **"Download All Again"**.
*   **Pause & Resume:** Transfers can be paused and resumed on the fly. The transfer loop pauses without dropping the WebRTC channel, maintaining sync between sender and receiver.
*   **Frictionless Sharing:** Instantly generate shareable links (e.g., `/d/12345#secretKey`) and **QR Codes**. The receiver scans or opens the link to start downloading immediately.
*   **Real-Time Progress & Transfer Metrics:** Live transfer speeds (MB/s), ETA calculations, and individual file progress bars.
*   **Signaling Protection:** The Spring Boot backend uses **Bucket4j** token-bucket rate limiting to prevent signaling spam and resource exhaustion.

---

## 🌊 Advanced Architecture (Under the Hood)

### 1. Receiver-Driven "Pull" Protocol
PeerLink operates on an on-demand pull model:
1. **Manifest Push:** Upon WebRTC data channel establishment (`onopen`), the Sender sends a JSON `file_manifest` containing the file list, indices, and sizes.
2. **File Request:** When the Receiver clicks **Get** (or the queue advances during **Download All**), the receiver sends a `request_file` message with the target file index.
3. **Chunk Streaming:** The Sender streams the requested file in 64 KB encrypted chunks until complete, followed by an `eof` message.
4. **Queue Advance:** The receiver locks its state synchronously to avoid concurrent stream collisions, sequentially pulling each file one by one.

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

    Note over S,C: 2. Manifest Exchange (Pull Architecture)
    S->>C: Sends JSON file_manifest [File A, File B]
    
    Note over S,C: 3. Selective Streaming (Disk / OPFS)
    C->>C: Reserves space (Save As... dialog or OPFS sandbox)
    C->>S: Sends request_file (Index 0: File A)
    loop 64KB Encrypted Chunks
        S-->>S: AES-256-GCM Encrypt
        S->>C: Binary Chunk via RTCDataChannel
        C->>C: AES-256-GCM Decrypt -> Write to Disk / OPFS Stream
    end
    S->>C: Sends { type: 'eof', index: 0 }
    C->>C: Closes stream, marks File A complete

    Note over S,C: 4. Sequential Queue (Download All)
    C->>S: Sends request_file (Index 1: File B)
    Note over S,C: Repeats stream-to-disk loop for File B...
```

---

## 🛠️ Tech Stack

### Frontend
*   **Framework:** Next.js 14 / React
*   **Styling:** Tailwind CSS
*   **P2P / Networking:** WebRTC (`RTCPeerConnection`, `RTCDataChannel`)
*   **Storage & Streaming:** File System Access API (`showSaveFilePicker`), Origin Private File System (OPFS)
*   **Security:** Web Crypto API (`crypto.subtle` - AES-256-GCM)
*   **UI Components:** `qrcode.react`, `react-icons`, `react-hot-toast`

### Backend
*   **Framework:** Java 17 + Spring Boot 3
*   **Real-time Protocol:** Spring WebSocket (TextWebSocketHandler)
*   **Message Broker:** Spring Data Redis Pub/Sub (Upstash Redis)
*   **Rate Limiting & Abuse Prevention:** Bucket4j

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

PeerLink guarantees that **no file data or encryption keys ever touch the server**:
* All files are transferred peer-to-peer directly between client browsers.
* The AES-256 encryption key is generated locally on the sender's device and appended to the invite link URL strictly as a hash fragment (`#key`).
* Browsers never transmit hash fragments to HTTP or WebSocket servers (RFC 3986), ensuring zero-knowledge End-to-End Encryption.
