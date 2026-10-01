package com.homestocker.modules.notify.app;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class ExpireNotifyJob {

  private static final Logger log = LoggerFactory.getLogger(ExpireNotifyJob.class);

  private final ExpireNotifyService expireNotifyService;

  public ExpireNotifyJob(ExpireNotifyService expireNotifyService) {
    this.expireNotifyService = expireNotifyService;
  }

  /** Default 08:00 Asia/Shanghai — cron from config is not wired yet; keep simple. */
  @Scheduled(cron = "0 0 8 * * *", zone = "Asia/Shanghai")
  public void daily() {
    try {
      expireNotifyService.run();
    } catch (Exception e) {
      log.error("expireNotify scheduled run failed", e);
    }
  }
}
