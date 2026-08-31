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
import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class SignalingHandler extends TextWebSocketHandler {

    // Maps: code -> session
    private final ConcurrentHashMap<String, WebSocketSession> senders = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, WebSocketSession> receivers = new ConcurrentHashMap<>();

    // Rate limiter per session: session ID -> Bucket
    // Allows 30 messages per minute, with a burst of 10 messages instantly.
    private final ConcurrentHashMap<String, Bucket> rateLimiters = new ConcurrentHashMap<>();

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final StringRedisTemplate redisTemplate;

    public SignalingHandler(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    /** Creates a rate-limit bucket: 30 tokens per minute, refilling 1 token every 2 seconds. */
    private Bucket newBucket() {
        return Bucket.builder()
                .addLimit(Bandwidth.classic(30, Refill.greedy(30, Duration.ofMinutes(1))))
                .build();
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        rateLimiters.put(session.getId(), newBucket());
        System.out.println("New WebSocket connection: " + session.getId());
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        // --- Rate Limiting Check ---
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
                senders.put(sigMsg.getCode(), session);
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
