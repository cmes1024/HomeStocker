package com.homestocker.infra.jdbc;

import java.sql.Timestamp;

public record FamilyRow(
    String id,
    String name,
    String inviteCode,
    String ownerOpenid,
    int memberCount,
    Integer itemCount,
    String backgroundJson,
    boolean expireReminderEnabled,
    int expireReminderDays,
    int expireReminderHour,
    int expireReminderMinute,
    Timestamp tagsSeededAt,
    String entitlementJson,
    Timestamp createdAt) {}
