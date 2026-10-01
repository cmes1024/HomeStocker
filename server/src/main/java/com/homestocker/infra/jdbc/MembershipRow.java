package com.homestocker.infra.jdbc;

import java.sql.Timestamp;

public record MembershipRow(String openid, String familyId, Timestamp joinedAt) {}
