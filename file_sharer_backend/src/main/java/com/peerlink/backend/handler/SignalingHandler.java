package com.peerlink.backend.handler;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.peerlink.backend.model.SignalingMessage;
import com.peerlink.backend.config.RedisConfig;
import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.Refill;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

@Component
public class SignalingHandler extends TextWebSocketHandler {

    private final ConcurrentHashMap<String, WebSocketSession> senders = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, WebSocketSession> receivers = new ConcurrentHashMap<>();

    // Room codes are claimed in Redis (not just this instance's local `senders` map) because
    // multiple backend instances can be running behind the same Redis — a sender connected to
    // instance A must not collide with one connected to instance B. Tracks which code (if any)
    // each session claimed, so the claim can be released as soon as that sender disconnects
    // rather than sitting on the TTL.
    private static final String CODE_CLAIM_PREFIX = "peerlink:code:";
    private static final Duration CODE_CLAIM_TTL = Duration.ofMinutes(15);
    private final ConcurrentHashMap<WebSocketSession, String> claimedCodes = new ConcurrentHashMap<>();

    // Track connection times for absolute 10-minute expiry
    private final ConcurrentHashMap<WebSocketSession, Long> connectionTimes = new ConcurrentHashMap<>();
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();

    // Rate limiter per session: session ID -> Bucket
    // Sized to absorb a full WebRTC negotiation's signaling burst (join, offer/answer,
    // and every trickled ICE candidate) without tripping — see newBucket() below.
    private final ConcurrentHashMap<String, Bucket> rateLimiters = new ConcurrentHashMap<>();

    // Per-IP concurrent connection cap. A per-session bucket alone doesn't stop a single
    // attacker from just opening more sessions — each new one gets a fresh allowance. This
    // bounds how many connections one source address may hold open at once. Kept generous
    // since many legitimate users can share one public IP (office wifi, campus/carrier NAT).
    private static final int MAX_CONNECTIONS_PER_IP = 20;
    private final ConcurrentHashMap<String, AtomicInteger> connectionsPerIp = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<WebSocketSession, String> sessionIps = new ConcurrentHashMap<>();

    // Server-wide connection cap, independent of source IP. The per-IP cap alone doesn't
    // bound aggregate memory use — enough distinct IPs each individually "within limits" can
    // still add up to a connection flood. Render's free tier (render.yaml) gives this instance
    // 512MB RAM; a Spring Boot + Tomcat + WebSocket baseline typically already uses ~150-300MB
    // at idle, leaving a modest remainder for per-connection memory (session + I/O buffers,
    // roughly tens of KB each). 300 is picked to sit comfortably under that remaining budget
    // while being far above this app's realistic legitimate concurrent usage — not a measured
    // limit, so watch Render's actual memory graph under real load and adjust.
    private static final int MAX_TOTAL_CONNECTIONS = 300;
    private final AtomicInteger totalConnections = new AtomicInteger(0);

    // Server-wide message-rate circuit breaker across ALL sessions combined. Per-session/
    // per-IP limits only bound one connection/address's own rate — they do nothing against a
    // distributed attacker spread across many IPs, each individually "within limits." Kept
    // conservative (not just memory-safe but CPU-conscious) since Render's free tier gives
    // this instance only 0.1 vCPU — sustained JSON parsing + Redis publish across many
    // concurrent connections can saturate that well before RAM becomes the bottleneck. Tune
    // based on observed traffic and actual instance capacity.
    private static final int GLOBAL_LIMIT_PER_MINUTE = 3000;
    private final Bucket globalBucket = Bucket.builder()
            .addLimit(Bandwidth.classic(GLOBAL_LIMIT_PER_MINUTE, Refill.greedy(GLOBAL_LIMIT_PER_MINUTE, Duration.ofMinutes(1))))
            .build();

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final StringRedisTemplate redisTemplate;

    public SignalingHandler(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;

        // Start cleanup task to aggressively expire WebSockets after 10 minutes
        // This prevents resource leaks for abandoned sender tabs. WebRTC data channels
        // take over after negotiation, so the WebSocket is unnecessary after a few seconds anyway.
        scheduler.scheduleAtFixedRate(() -> {
            long now = System.currentTimeMillis();
            long maxDuration = 10 * 60 * 1000; // 10 minutes
            for (Map.Entry<WebSocketSession, Long> entry : connectionTimes.entrySet()) {
                if (now - entry.getValue() > maxDuration) {
                    try {
                        entry.getKey().close(new CloseStatus(1000, "Session expired after 10 minutes to save resources."));
                    } catch (IOException e) {
                        // ignore
                    }
                }
            }
        }, 1, 1, TimeUnit.MINUTES);
    }

    /**
     * Creates a rate-limit bucket. ICE candidate trickling alone can legitimately produce
     * dozens of small messages within the first few seconds of a session — one per local
     * interface/STUN-reflexive candidate — before the peer connection is even established;
     * that burst is normal signaling traffic, not abuse. A too-tight limit here was closing
     * sessions mid-negotiation with code 1008 even though the WebRTC connection went on to
     * succeed. 100 tokens up front, refilling 100 more per minute, comfortably covers real
     * signaling traffic while still bounding a client that just spams messages.
     */
    private Bucket newBucket() {
        return Bucket.builder()
                .addLimit(Bandwidth.classic(100, Refill.greedy(100, Duration.ofMinutes(1))))
                .build();
    }

    /**
     * Render (see render.yaml) puts every connection through its own reverse proxy, so
     * session.getRemoteAddress() would return Render's proxy address for every single user —
     * collapsing all clients into one shared bucket and making the per-IP cap useless at best,
     * actively harmful at worst. Render's proxy appends the address it saw to X-Forwarded-For,
     * so with exactly one trusted proxy hop in front of us, the LAST entry is the one Render
     * itself observed — not something a client could spoof by pre-populating the header, since
     * whatever they send gets appended to, not replace, by that final hop. Falls back to the
     * raw socket address when the header is absent (local dev, no proxy in front at all).
     */
    private String clientIp(WebSocketSession session) {
        String xff = session.getHandshakeHeaders().getFirst("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            String[] parts = xff.split(",");
            return parts[parts.length - 1].trim();
        }
        InetSocketAddress addr = session.getRemoteAddress();
        return addr != null ? addr.getAddress().getHostAddress() : "unknown";
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        if (totalConnections.incrementAndGet() > MAX_TOTAL_CONNECTIONS) {
            totalConnections.decrementAndGet();
            System.out.println("Total connection cap reached — rejecting new connection.");
            try {
                session.close(new CloseStatus(1008, "Server is at capacity. Please try again shortly."));
            } catch (IOException e) {
                // ignore
            }
            return;
        }

        String ip = clientIp(session);
        AtomicInteger count = connectionsPerIp.computeIfAbsent(ip, k -> new AtomicInteger(0));
        if (count.incrementAndGet() > MAX_CONNECTIONS_PER_IP) {
            count.decrementAndGet();
            totalConnections.decrementAndGet();
            System.out.println("Connection cap exceeded for IP: " + ip);
            try {
                session.close(new CloseStatus(1008, "Too many concurrent connections from this address."));
            } catch (IOException e) {
                // ignore
            }
            return;
        }
        // Marks this session as fully accepted — afterConnectionClosed only reverses the
        // totalConnections/connectionsPerIp increments above when this is present, so a
        // session rejected by either cap (which already self-corrected its own count before
        // returning, above) doesn't get double-decremented when Spring still calls close.
        sessionIps.put(session, ip);

        rateLimiters.put(session.getId(), newBucket());
        connectionTimes.put(session, System.currentTimeMillis());
        System.out.println("New WebSocket connection: " + session.getId());
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        // --- Global Circuit Breaker ---
        // Trips only under a genuine flood spread across many sessions/IPs at once. Drops the
        // message rather than closing the connection: whoever happens to send while the global
        // budget is exhausted is not necessarily the reason it's exhausted, and tearing down
        // essentially random sessions mid-flood — including legitimate ones mid-transfer —
        // would make an attack's damage worse, not better.
        if (!globalBucket.tryConsume(1)) {
            System.out.println("Global signaling rate limit exceeded — dropping message from session: " + session.getId());
            return;
        }

        // --- Per-Session Rate Limiting Check ---
        Bucket bucket = rateLimiters.get(session.getId());
        if (bucket == null || !bucket.tryConsume(1)) {
            System.out.println("Rate limit exceeded for session: " + session.getId());
            session.close(new CloseStatus(1008, "Rate limit exceeded. Too many signaling messages."));
            return;
        }

        String payload = message.getPayload();
        SignalingMessage sigMsg = objectMapper.readValue(payload, SignalingMessage.class);

        if ("join".equals(sigMsg.getType())) {
            // Register session locally
            if ("sender".equals(sigMsg.getRole())) {
                String code = sigMsg.getCode();
                Boolean claimed = redisTemplate.opsForValue()
                        .setIfAbsent(CODE_CLAIM_PREFIX + code, session.getId(), CODE_CLAIM_TTL);
                if (!Boolean.TRUE.equals(claimed)) {
                    // Another sender already holds this room code — reject so the client
                    // can generate a different one instead of silently hijacking that session.
                    SignalingMessage rejection = new SignalingMessage();
                    rejection.setType("code_taken");
                    rejection.setCode(code);
                    rejection.setRole("sender");
                    session.sendMessage(new TextMessage(objectMapper.writeValueAsString(rejection)));
                    return;
                }
                claimedCodes.put(session, code);
                senders.put(code, session);
            } else if ("receiver".equals(sigMsg.getRole())) {
                receivers.put(sigMsg.getCode(), session);
            }
            // Broadcast join so the other peer knows we arrived
            redisTemplate.convertAndSend(RedisConfig.SIGNALING_TOPIC, payload);
            return;
        }

        // For other messages (offer, answer, ice-candidate), publish to Redis so that
        // it can be routed to the correct counterpart.
        redisTemplate.convertAndSend(RedisConfig.SIGNALING_TOPIC, payload);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        // Cleanup on disconnect
        senders.values().remove(session);
        receivers.values().remove(session);
        rateLimiters.remove(session.getId());
        connectionTimes.remove(session);
        String claimedCode = claimedCodes.remove(session);
        if (claimedCode != null) {
            redisTemplate.delete(CODE_CLAIM_PREFIX + claimedCode);
        }
        String ip = sessionIps.remove(session);
        if (ip != null) {
            totalConnections.decrementAndGet();
            // Remove the counter entirely once it hits zero, rather than leaving a dead
            // zero-valued entry behind for every distinct IP ever seen.
            connectionsPerIp.computeIfPresent(ip, (k, count) -> count.decrementAndGet() <= 0 ? null : count);
        }
        System.out.println("WebSocket connection closed: " + session.getId());
    }

    /**
     * Called by Redis Message Listener when a message is published to the signaling topic.
     */
    public void handleRedisMessage(String message) {
        try {
            SignalingMessage sigMsg = objectMapper.readValue(message, SignalingMessage.class);
            String code = sigMsg.getCode();
            String role = sigMsg.getRole();

            // Route message to the OTHER role
            if ("sender".equals(role)) {
                // Sender sent this, so route to receiver
                WebSocketSession receiverSession = receivers.get(code);
                if (receiverSession != null && receiverSession.isOpen()) {
                    receiverSession.sendMessage(new TextMessage(message));
                }
            } else if ("receiver".equals(role)) {
                // Receiver sent this, so route to sender
                WebSocketSession senderSession = senders.get(code);
                if (senderSession != null && senderSession.isOpen()) {
                    senderSession.sendMessage(new TextMessage(message));
                }
            }
        } catch (IOException e) {
            e.printStackTrace();
        }
    }
}
