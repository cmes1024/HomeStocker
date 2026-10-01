package com.homestocker.infra.jdbc;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.Timestamp;
import java.util.List;

public record ItemRow(
    String id,
    String familyId,
    String name,
    BigDecimal quantity,
    String unit,
    String note,
    String spaceId,
    String locationId,
    Date productionDate,
    Date expireDate,
    String createdBy,
    String source,
    Timestamp createdAt,
    Timestamp updatedAt,
    List<String> tagIds,
    List<String> imageFileIDs) {}
