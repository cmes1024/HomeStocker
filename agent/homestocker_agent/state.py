"""LangGraph State 定义。"""

from typing import Annotated, TypedDict

from langgraph.graph.message import add_messages


class AgentState(TypedDict, total=False):
    # 对话消息（add_messages 累加器）
    messages: Annotated[list, add_messages]
    # 鉴权得到的用户 ID（云函数注入，同 openId）
    user_id: str
    # load_context 解析出的当前家庭
    family_id: str
    family_name: str
    locations: list[str]
    categories: list[str]
    system_prompt: str
