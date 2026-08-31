# Use a base image with Java 17 installed
FROM openjdk:17-jdk-slim

# Set the working directory inside the container
WORKDIR /app

# Copy the Maven wrapper and project files
COPY .mvn/ .mvn
COPY mvnw pom.xml ./

# Build the application and download dependencies
RUN ./mvnw dependency:go-offline

# Copy the rest of the source code
COPY src ./src

# Package the application, skipping tests
RUN ./mvnw package -DskipTests

# Expose the port the application will run on
EXPOSE 8080

# Command to run the application
CMD ["java", "-jar", "target/p2p-app-1.0-SNAPSHOT.jar"]