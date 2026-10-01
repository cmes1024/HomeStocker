package com.homestocker.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

@Configuration
@EnableConfigurationProperties(HomestockerProperties.class)
public class AppConfig {

  @Bean
  RestClient.Builder restClientBuilder() {
    return RestClient.builder();
  }
}
