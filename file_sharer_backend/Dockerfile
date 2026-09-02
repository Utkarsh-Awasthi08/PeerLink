# ─── Stage 1: Build & Package ──────────────────────────────────────────────────
FROM eclipse-temurin:17-jdk-jammy AS builder

WORKDIR /build

# Copy Maven wrapper files and dependency descriptors
COPY .mvn/ .mvn
COPY mvnw pom.xml ./

# Ensure maven wrapper is executable
RUN chmod +x ./mvnw

# Pre-download dependencies in a separate layer for faster cached builds
RUN ./mvnw dependency:go-offline -B

# Copy project source code
COPY src ./src

# Build production jar skipping unit tests
RUN ./mvnw clean package -DskipTests -B

# ─── Stage 2: Minimal Production Runtime ───────────────────────────────────────
FROM eclipse-temurin:17-jre-jammy AS runner

WORKDIR /app

# Install curl for container healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Run as a dedicated non-root user for security
RUN groupadd -r spring && useradd -r -g spring spring

# Copy the compiled jar from builder stage as a standardized app.jar
COPY --from=builder /build/target/*.jar /app/app.jar

# Set ownership
RUN chown -R spring:spring /app

USER spring:spring

# Expose default port
EXPOSE 8080

# Environment variables with container-optimized JVM flags
ENV PORT=8080 \
    JAVA_OPTS="-XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0 -Djava.security.egd=file:/dev/./urandom"

# Healthcheck to verify the server is healthy and responding
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD curl -f http://localhost:${PORT}/ || exit 1

# Launch application with dynamic port binding
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -Dserver.port=${PORT} -jar /app/app.jar"]