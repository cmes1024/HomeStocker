package com.homestocker.modules.ai.tools;

import java.util.Map;

public interface ActTool {
  String id();

  ToolResult run(ToolContext ctx, Map<String, Object> call, int step);
}
