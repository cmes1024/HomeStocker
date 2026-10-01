package com.homestocker.modules.ai.knowledge;

public record KnowledgePack(
    String topicId,
    int version,
    boolean enabled,
    String title,
    String summary,
    String body) {}
