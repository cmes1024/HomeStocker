# Multi-stage build: host needs Docker only (no JDK/Maven on the machine).
FROM maven:3.9.9-eclipse-temurin-17 AS build
WORKDIR /workspace

COPY pom.xml .
# Aliyun mirror: plain Maven Central is flaky from CN hosts (deploy timeouts).
COPY docker-maven-settings.xml /root/.m2/settings.xml
# Deps cached in a BuildKit mount: src-only changes no longer re-download the world.
RUN --mount=type=cache,target=/root/.m2/repository \
  mvn -B -DskipTests dependency:go-offline

COPY src ./src
RUN --mount=type=cache,target=/root/.m2/repository \
  mvn -B -DskipTests package \
  && cp target/homestocker-server-*.jar /workspace/app.jar

FROM eclipse-temurin:17-jre-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache curl \
  && addgroup -S hs && adduser -S hs -G hs

COPY --from=build /workspace/app.jar /app/app.jar
RUN chown hs:hs /app/app.jar

USER hs

ENV JAVA_OPTS="-XX:MaxRAMPercentage=75.0"
EXPOSE 8080

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar /app/app.jar"]
