package com.peerlink.backend.model;

public class SignalingMessage {
    private String type; // "offer", "answer", "ice-candidate", "join"
    private String code;
    private String role; // "sender", "receiver"
    private Object payload;

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }
    public Object getPayload() { return payload; }
    public void setPayload(Object payload) { this.payload = payload; }
}
