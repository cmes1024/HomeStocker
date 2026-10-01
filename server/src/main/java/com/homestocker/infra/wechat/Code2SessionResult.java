package com.homestocker.infra.wechat;

public record Code2SessionResult(String openid, String sessionKey, String unionId) {}
