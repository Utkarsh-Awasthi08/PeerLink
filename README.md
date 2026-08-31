# PeerLink

PeerLink is a modern, serverless, peer-to-peer file-sharing web application. It enables users to securely share large files directly between browsers without storing any data on an intermediate server. 

By leveraging WebRTC for direct data streaming and the Web Crypto API for End-to-End Encryption, PeerLink guarantees absolute privacy, lightning-fast transfer speeds, and zero server storage overhead.

---

## 🚀 Features

*   **True Peer-to-Peer Transfers:** Files are chunked and streamed directly via WebRTC `RTCDataChannel`. The server never touches or stores your files.
*   **End-to-End Encryption (E2EE):** Every file chunk is encrypted client-side using **AES-256-GCM** before transmission. The decryption key is safely embedded in the URL fragment (`#`) and is never sent to the signaling server.
*   **Pause & Resume:** Network drop? Need to pause? The transfer loop supports resuming from the exact byte offset without restarting the entire upload.
*   **Frictionless Sharing:** Instantly generate shareable links (e.g., `/d/12345#secretKey`) and **QR Codes**. The receiver just opens the link or scans the QR with their phone camera to instantly start downloading.
*   **Real-Time Progress & UX:** Live transfer speeds (MB/s), ETA calculations, and visual progress bars.
*   **Signaling Protection:** The Spring Boot backend uses **Bucket4j** to rate-limit WebSocket connections and prevent malicious spamming.

---

## 🏗️ System Architecture

PeerLink is split into a Next.js Frontend and a Spring Boot Backend. The backend acts **only** as a WebRTC signaling server (to exchange ICE candidates, Offers, and Answers). 

Because the backend is horizontally scalable, it uses **Upstash Redis Pub/Sub** to route signaling messages between peers connected to different server instances.

```mermaid
sequenceDiagram
    participant S as Sender (Browser)
    participant B as Signaling Server (Spring Boot)
    participant R as Redis (Upstash)
    participant C as Receiver (Browser)

    Note over S,C: 1. Signaling Phase (WebSocket)
    S->>B: Connects via WS
    B->>R: Subscribes to Signaling Topic
    C->>B: Scans QR / Opens Link -> Connects via WS
    B->>R: Subscribes to Signaling Topic
    
    C->>B: "Join" message (Room 12345)
    B->>R: Publishes Join
    R->>B: Routes to Sender's WS Server
    B->>S: Sender notified Receiver joined

    Note over S,C: WebRTC Negotiation
    S->>B: Sends WebRTC Offer
    B->>R: Routes Offer via Redis
    R->>B: ->
    B->>C: Receiver gets Offer
    C->>B: Sends WebRTC Answer
    B->>R: Routes Answer via Redis
    R->>B: ->
    B->>S: Sender gets Answer

    Note over S,C: 2. File Transfer Phase (Direct WebRTC DataChannel)
    S-->>S: AES-256-GCM Encrypts Chunk
    S->>C: Streams Encrypted Chunk via RTCDataChannel (Bypasses Server)
    C-->>C: AES-256-GCM Decrypts Chunk
    C-->>C: Updates Progress, Speed & ETA
    S->>C: ... continues until EOF
```

---

## 🛠️ Tech Stack

### Frontend
*   **Framework:** Next.js (React)
*   **Styling:** Tailwind CSS
*   **P2P / Networking:** WebRTC (`RTCPeerConnection`, `RTCDataChannel`)
*   **Security:** Web Crypto API (`crypto.subtle`)
*   **UI Extras:** `qrcode.react`, `react-icons`, `react-hot-toast`

### Backend
*   **Framework:** Java 17 + Spring Boot 3
*   **Real-time:** Spring WebSocket
*   **Message Broker:** Spring Data Redis (Upstash)
*   **Rate Limiting:** Bucket4j

---

## ⚙️ Getting Started

### Prerequisites
*   Node.js (v18+)
*   Java 17+ and Maven
*   An [Upstash Redis](https://upstash.com/) database (or local Redis instance)

### 1. Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd file_sharer_backend
   ```
2. Export your Redis credentials (the server uses standard Spring Data Redis URI formatting):
   ```bash
   export REDIS_URL="rediss://default:YOUR_PASSWORD@your-upstash-url.upstash.io:6379"
   ```
3. Run the Spring Boot application:
   ```bash
   mvn spring-boot:run
   ```
   *The signaling server will start on port 8080.*

### 2. Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd file_sharer_frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables. (A `.env.local` file is supported):
   ```env
   NEXT_PUBLIC_WS_URL=ws://localhost:8080/signaling
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```
   *The frontend will start on port 3000.*

---

## 🔒 Security Notice

PeerLink guarantees that **no file data** is ever sent to or stored on the signaling server. The generated AES key is appended to the invite link URL strictly as a hash fragment (`#key`). Browsers do not send URL fragments to HTTP servers, ensuring true End-to-End Encryption.
