"""LangGraph 图：load_context → classify → call_tool → respond。"""

import json
from typing import Literal

from langchain_core.messages import AIMessage, SystemMessage, ToolMessage
from langgraph.graph import END, START, StateGraph

from .data import DataBackend, MockBackend
from .llm import get_llm
from .prompts import build_system_prompt
from .state import AgentState
from .tools import build_tools


def _tc_get(tc, key: str):
    """兼容 tool_call 为 dict 或对象两种形式。"""
    if isinstance(tc, dict):
        return tc.get(key)
    return getattr(tc, key, None)


def build_graph(backend: DataBackend | None = None, model=None):
    backend = backend or MockBackend()
    model = model or get_llm()
    tools = build_tools(backend)
    tool_map = {t.name: t for t in tools}
    tools_bound = model.bind_tools(tools)

    def load_context(state: AgentState) -> dict:
        user_id = state.get("user_id") or "demo-user"
        family_id = backend.resolve_family_id(user_id)
        fam = backend.get_family(family_id)
        if not fam:
            return {
                "family_id": family_id,
                "family_name": "",
                "locations": [],
                "categories": [],
                "system_prompt": "你是「HomeStocker」家庭物资管理助手，帮助用户查询与录入物资。",
            }
        return {
            "family_id": family_id,
            "family_name": fam.name,
            "locations": fam.locations,
            "categories": fam.categories,
            "system_prompt": build_system_prompt(fam),
        }

    def classify(state: AgentState) -> dict:
        msgs = [SystemMessage(content=state["system_prompt"])] + list(state["messages"])
        resp = tools_bound.invoke(msgs)
        return {"messages": [resp]}

    def route_after_classify(state: AgentState) -> Literal["call_tool", "end"]:
        last = state["messages"][-1]
        if isinstance(last, AIMessage) and getattr(last, "tool_calls", None):
            return "call_tool"
        return "end"

    def call_tool(state: AgentState) -> dict:
        last = state["messages"][-1]
        outputs = []
        for tc in last.tool_calls:
            name = _tc_get(tc, "name")
            args = dict(_tc_get(tc, "args") or {})
            args["family_id"] = state["family_id"]  # 强制覆盖，防越权
            tool = tool_map.get(name)
            if tool is None:
                result = {"ok": False, "error": f"未知工具：{name}"}
            else:
                try:
                    result = tool.invoke(args)
                except Exception as exc:  # noqa: BLE001
                    result = {"ok": False, "error": str(exc)}
            outputs.append(
                ToolMessage(
                    content=json.dumps(result, ensure_ascii=False),
                    tool_call_id=_tc_get(tc, "id"),
                )
            )
        return {"messages": outputs}

    def respond(state: AgentState) -> dict:
        msgs = [SystemMessage(content=state["system_prompt"])] + list(state["messages"])
        resp = model.invoke(msgs)
        return {"messages": [resp]}

    g = StateGraph(AgentState)
    g.add_node("load_context", load_context)
    g.add_node("classify", classify)
    g.add_node("call_tool", call_tool)
    g.add_node("respond", respond)

    g.add_edge(START, "load_context")
    g.add_edge("load_context", "classify")
    g.add_conditional_edges(
        "classify", route_after_classify, {"call_tool": "call_tool", "end": END}
    )
    g.add_edge("call_tool", "respond")
    g.add_edge("respond", END)

    return g.compile()
