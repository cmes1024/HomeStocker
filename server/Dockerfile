# Multi-stage build: host needs Docker only (no JDK/Maven on the machine).
FROM maven:3.9.9-eclipse-temurin-17 AS build
WORKDIR /workspace

COPY pom.xml .
COPY src ./src
RUN mvn -B -DskipTests package \
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
