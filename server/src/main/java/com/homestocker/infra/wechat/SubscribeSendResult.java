package com.homestocker.infra.wechat;

/** Outcome of subscribeMessage.send (or local dry-run). */
public record SubscribeSendResult(Status status, String error) {

  public enum Status {
    SENT,
    DRY_RUN,
    FAILED
  }

  public static SubscribeSendResult sent() {
    return new SubscribeSendResult(Status.SENT, null);
  }

  public static SubscribeSendResult dryRun() {
    return new SubscribeSendResult(Status.DRY_RUN, null);
  }

  public static SubscribeSendResult failed(String error) {
    return new SubscribeSendResult(Status.FAILED, error == null ? "" : error);
  }

  public boolean okOrDryRun() {
    return status == Status.SENT || status == Status.DRY_RUN;
  }
}
