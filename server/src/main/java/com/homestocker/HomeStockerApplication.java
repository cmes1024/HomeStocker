package com.homestocker;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * HomeStocker API entry.
 * Business modules are scaffolded under {@code com.homestocker.modules.*};
 * implement against docs/plans/2026-09-30-java-backend-migration/.
 */
@SpringBootApplication
@EnableScheduling
public class HomeStockerApplication {

  public static void main(String[] args) {
    SpringApplication.run(HomeStockerApplication.class, args);
  }
}
