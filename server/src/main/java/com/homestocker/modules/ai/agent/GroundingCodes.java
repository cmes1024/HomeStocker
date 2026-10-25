package com.homestocker.modules.ai.agent;

/** 工具回执错误码。服务端只说事实，不下中文指令。 */
public final class GroundingCodes {

  /** 落点来源不可核（缺落点、落点不在家庭结构、落点不是这句话说的）。 */
  public static final String PLACE_UNGROUNDED = "PLACE_UNGROUNDED";

  /** 数量来源不可核（写成数与这句话里的数对不上）。 */
  public static final String QTY_UNGROUNDED = "QTY_UNGROUNDED";

  /** 短号不存在或已失效。 */
  public static final String REF_UNKNOWN = "REF_UNKNOWN";

  /** 同名多条，需指明。 */
  public static final String REF_AMBIGUOUS = "REF_AMBIGUOUS";

  /** 名称无匹配。 */
  public static final String NAME_NOT_FOUND = "NAME_NOT_FOUND";

  /** inference 缺 via。 */
  public static final String INFERENCE_NO_BASIS = "INFERENCE_NO_BASIS";

  /** 不可逆动作已扣住，等家人确认。 */
  public static final String WRITE_HELD = "WRITE_HELD";

  /** 信息不足，已向家人提问。 */
  public static final String ASK_REQUIRED = "ASK_REQUIRED";

  private GroundingCodes() {}
}
