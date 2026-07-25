FROM eclipse-temurin:17-jre
WORKDIR /app
COPY sky-server/target/sky-server-1.0-SNAPSHOT.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
