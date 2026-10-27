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

  /**
   * 每分钟扫一次，是否该发由各家庭自己配置的「发送时间」决定（含 2 小时补发窗口）。
   *
   * <p>cron 走 {@code homestocker.expire-notify.cron}；本地/测试可用 {@code -} 关闭。
   */
  @Scheduled(cron = "${homestocker.expire-notify.cron:0 * * * * *}", zone = "Asia/Shanghai")
  public void scan() {
    try {
      expireNotifyService.runScheduled();
    } catch (Exception e) {
      log.error("expireNotify scheduled run failed", e);
    }
  }
}
