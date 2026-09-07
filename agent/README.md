# HomeStocker Agent

家庭物资管理小程序的 AI 对话助手后端服务（V1：查询 + 简单录入）。

技术栈：**LangChain（模型/工具/消息抽象）+ LangGraph（状态编排）+ FastAPI**。

## 运行

```bash
uv sync                # 安装依赖（Python 3.11）
cp .env.example .env   # 填入 LLM_API_KEY
uv run python smoke_test.py          # 冒烟测试（无需真实 LLM key）
uv run uvicorn server:app --reload --port 8000   # 启动服务
```

验证：

```bash
curl -X POST http://127.0.0.1:8000/chat \
  -H 'Content-Type: application/json' \
  -d '{"user_id":"demo-user","message":"哪些快过期了"}'
```

## 目录

| 文件 | 说明 |
|------|------|
| `server.py` | FastAPI 入口，`POST /chat`（非流式） |
| `smoke_test.py` | 无需真实 LLM 的冒烟测试 |
| `homestocker_agent/data.py` | 数据模型 + `DataBackend` 接口 + `MockBackend`（内存 mock） |
| `homestocker_agent/llm.py` | 可插拔 LLM 适配器（OpenAI 兼容，默认 DeepSeek） |
| `homestocker_agent/prompts.py` | 系统提示词（家庭上下文 + 规则） |
| `homestocker_agent/tools.py` | 4 个工具：get_current_family / search_items / list_expiring / add_item |
| `homestocker_agent/state.py` | LangGraph State |
| `homestocker_agent/graph.py` | LangGraph 图（load_context → classify → call_tool → respond） |

## 关键设计

- **family_id 注入**：`call_tool` 节点用 `state["family_id"]` 强制覆盖工具参数，防止 LLM 伪造/越权访问其它家庭。
- **数据后端可替换**：`DataBackend` 是接口，当前用 `MockBackend`；后续换成云开发（CloudBase）后端即可，工具与图逻辑不变。
- **LLM 可插拔**：换模型只需改 `.env` 的 `LLM_BASE_URL` / `LLM_MODEL`（OpenAI 兼容端点）。
