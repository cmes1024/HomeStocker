package com.homestocker.modules.voice.app;

import java.util.List;

/**
 * 朗读可用的 TTS 模型白名单。
 *
 * <p>为什么不复用 {@code ModelCatalog}：那边收录的是对话/视觉模型，能不能合成语音是另一回事。
 * MiMo 的 TTS 是独立模型（{@code mimo-v2.5-tts}），对话模型合不出声音。
 *
 * <p>当前只有一项，所以前端不给选择器；等出现第二个模型，家庭配置里存的值会自动生效，
 * 这里加一条即可。
 */
public final class VoiceTtsModels {

  public record Option(String id, String label) {}

  /** 默认朗读模型；家庭没有单独配置时用它。 */
  public static final String DEFAULT = "mimo-v2.5-tts";

  private static final List<Option> OPTIONS = List.of(new Option(DEFAULT, "MiMo V2.5 朗读"));

  private VoiceTtsModels() {}

  public static List<Option> options() {
    return OPTIONS;
  }

  public static boolean isAllowed(String model) {
    return model != null && OPTIONS.stream().anyMatch(option -> option.id().equals(model));
  }

  public static String labelOf(String model) {
    return OPTIONS.stream()
        .filter(option -> option.id().equals(model))
        .map(Option::label)
        .findFirst()
        .orElse(model);
  }
}
