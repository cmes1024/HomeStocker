package com.homestocker.common;

/**
 * Business error codes aligned with cloud-function {@code fail(code, message)} strings.
 * Prefer reusing existing client checks over inventing new codes.
 */
public final class ErrorCodes {

  public static final String UNAUTHORIZED = "UNAUTHORIZED";
  public static final String BAD_REQUEST = "BAD_REQUEST";
  public static final String FORBIDDEN = "FORBIDDEN";
  public static final String NO_FAMILY = "NO_FAMILY";
  public static final String NOT_MEMBER = "NOT_MEMBER";
  public static final String WECHAT_LOGIN_FAILED = "WECHAT_LOGIN_FAILED";
  public static final String AUTH_NOT_CONFIGURED = "AUTH_NOT_CONFIGURED";
  public static final String INTERNAL = "INTERNAL";

  public static final String INVALID_NAME = "INVALID_NAME";
  public static final String INVALID_CODE = "INVALID_CODE";
  public static final String INVALID_FAMILY = "INVALID_FAMILY";
  public static final String INVALID_BACKGROUND = "INVALID_BACKGROUND";
  public static final String INVALID_PROFILE = "INVALID_PROFILE";
  public static final String INVALID_NICKNAME = "INVALID_NICKNAME";
  public static final String INVALID_AVATAR = "INVALID_AVATAR";
  public static final String INVALID_PRODUCT = "INVALID_PRODUCT";
  public static final String INVALID_DURATION = "INVALID_DURATION";
  public static final String FAMILY_LIMIT_REACHED = "FAMILY_LIMIT_REACHED";
  public static final String MEMBER_LIMIT_REACHED = "MEMBER_LIMIT_REACHED";
  public static final String ALREADY_IN_FAMILY = "ALREADY_IN_FAMILY";
  public static final String INVITE_CODE_EXHAUSTED = "INVITE_CODE_EXHAUSTED";
  public static final String CODE_REVOKED = "CODE_REVOKED";
  public static final String CODE_USED = "CODE_USED";
  public static final String UNKNOWN_ACTION = "UNKNOWN_ACTION";

  public static final String INVALID_QUANTITY = "INVALID_QUANTITY";
  public static final String INVALID_DATE = "INVALID_DATE";
  public static final String INVALID_IMAGE = "INVALID_IMAGE";
  public static final String INVALID_SPACE = "INVALID_SPACE";
  public static final String INVALID_LOCATION = "INVALID_LOCATION";
  public static final String INVALID_TAGS = "INVALID_TAGS";
  public static final String INVALID_ID = "INVALID_ID";
  public static final String INVALID_IDS = "INVALID_IDS";
  public static final String INVALID_ITEMS = "INVALID_ITEMS";
  public static final String INVALID_MERGE = "INVALID_MERGE";
  public static final String NOT_FOUND = "NOT_FOUND";
  public static final String ITEM_LIMIT_REACHED = "ITEM_LIMIT_REACHED";
  public static final String DEFAULT_SPACE = "DEFAULT_SPACE";
  public static final String LAST_SPACE = "LAST_SPACE";
  public static final String DUPLICATE_NAME = "DUPLICATE_NAME";

  public static final String NO_AI_KEY = "NO_AI_KEY";
  public static final String INVALID_TEXT = "INVALID_TEXT";
  public static final String ACT_FAILED = "ACT_FAILED";
  public static final String AI_QUOTA = "AI_QUOTA";
  public static final String RATE_LIMITED = "RATE_LIMITED";
  public static final String HABIT_LIMIT_REACHED = "HABIT_LIMIT_REACHED";
  public static final String INVALID_HABIT = "INVALID_HABIT";

  private ErrorCodes() {}
}
