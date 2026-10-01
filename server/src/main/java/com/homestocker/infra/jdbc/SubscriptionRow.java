package com.homestocker.infra.jdbc;

import java.sql.Timestamp;

public record SubscriptionRow(
    String familyId,
    String planId,
    String product,
    String source,
    Timestamp expiresAt,
    String limitsOverrideJson) {}
