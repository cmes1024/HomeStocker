"""可插拔 LLM 适配器。

默认走 DeepSeek 的 OpenAI 兼容端点；换 Qwen/GLM/混元 只需改 .env 里的
LLM_BASE_URL / LLM_MODEL（均提供 OpenAI 兼容接口）。
"""

import os

from langchain_openai import ChatOpenAI

DEFAULT_BASE_URL = "https://api.deepseek.com"
DEFAULT_MODEL = "deepseek-chat"


def get_llm() -> ChatOpenAI:
    api_key = os.getenv("LLM_API_KEY") or os.getenv("DEEPSEEK_API_KEY")
    if not api_key:
        raise RuntimeError(
            "缺少 LLM_API_KEY / DEEPSEEK_API_KEY 环境变量，请参照 .env.example 配置"
        )
    return ChatOpenAI(
        model=os.getenv("LLM_MODEL", DEFAULT_MODEL),
        api_key=api_key,
        base_url=os.getenv("LLM_BASE_URL", DEFAULT_BASE_URL),
        temperature=float(os.getenv("LLM_TEMPERATURE", "0")),
    )
