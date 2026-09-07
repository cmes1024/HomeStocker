"""冒烟测试：无需真实 LLM key，验证工具逻辑与图编排。"""

from dotenv import load_dotenv

load_dotenv()

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langchain_core.outputs import ChatGeneration, ChatResult

from homestocker_agent.data import MockBackend
from homestocker_agent.graph import build_graph
from homestocker_agent.tools import build_tools


class ScriptedChatModel(BaseChatModel):
    """按顺序返回预置消息的假模型，支持 bind_tools（返回自身）。"""

    def __init__(self, responses: list[BaseMessage]):
        super().__init__()
        self._responses = list(responses)
        self._i = 0

    @property
    def _llm_type(self) -> str:
        return "scripted-chat-model"

    def bind_tools(self, tools, **kwargs):
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs) -> ChatResult:
        msg = self._responses[self._i % len(self._responses)]
        self._i += 1
        return ChatResult(generations=[ChatGeneration(message=msg)])


def test_tools() -> None:
    backend = MockBackend()
    tools = build_tools(backend)
    tmap = {t.name: t for t in tools}

    fam = tmap["get_current_family"].invoke({"family_id": "family-demo"})
    assert fam["ok"] is True and fam["family"]["name"] == "自己家", fam

    hits = tmap["search_items"].invoke({"query": "牛奶", "family_id": "family-demo"})
    assert len(hits) == 1 and hits[0]["name"] == "牛奶", hits

    exp = tmap["list_expiring"].invoke({"days": 3, "family_id": "family-demo"})
    names = {i["name"] for i in exp}
    assert "牛奶" in names and "感冒药" in names, exp  # 临期 + 已过期

    added = tmap["add_item"].invoke(
        {
            "name": "酱油",
            "quantity": 1,
            "unit": "瓶",
            "location": "厨房柜",
            "category": "调味品",
            "family_id": "family-demo",
        }
    )
    assert added["ok"] is True and added["item"]["name"] == "酱油", added

    missing = tmap["add_item"].invoke({"name": "牙膏", "family_id": "family-demo"})
    assert missing["ok"] is False and "数量" in missing["missing"], missing

    # 自动补齐：不存在的分类/位置会被加入家庭预设
    tmap["add_item"].invoke(
        {
            "name": "猫粮",
            "quantity": 1,
            "unit": "袋",
            "location": "储物间",
            "category": "宠物用品",
            "family_id": "family-demo",
        }
    )
    fam2 = tmap["get_current_family"].invoke({"family_id": "family-demo"})
    assert "储物间" in fam2["family"]["locations"], fam2
    assert "宠物用品" in fam2["family"]["categories"], fam2

    print("[OK] tools")


def test_graph_no_tool_path() -> None:
    backend = MockBackend()
    fake = ScriptedChatModel([AIMessage(content="你好，我是物资助手。")])
    graph = build_graph(backend=backend, model=fake)
    result = graph.invoke(
        {"messages": [HumanMessage(content="你好")], "user_id": "demo-user"}
    )
    assert result["family_id"] == "family-demo", result
    assert result["messages"][-1].content == "你好，我是物资助手。", result
    print("[OK] graph (no-tool path)")


def test_graph_tool_path() -> None:
    backend = MockBackend()
    fake = ScriptedChatModel(
        [
            # classify：返回一个 search_items 的 tool_call
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": "search_items",
                        "args": {"query": "牛奶"},
                        "id": "call1",
                        "type": "tool_call",
                    }
                ],
            ),
            # respond：基于工具结果给出最终回复
            AIMessage(content="家里有 2 盒牛奶，放在冰箱冷藏。"),
        ]
    )
    graph = build_graph(backend=backend, model=fake)
    result = graph.invoke(
        {"messages": [HumanMessage(content="家里还有牛奶吗")], "user_id": "demo-user"}
    )
    kinds = [type(m).__name__ for m in result["messages"]]
    assert "ToolMessage" in kinds, kinds  # 工具确实执行了
    assert result["messages"][-1].content == "家里有 2 盒牛奶，放在冰箱冷藏。", result
    print("[OK] graph (tool path)")


if __name__ == "__main__":
    test_tools()
    test_graph_no_tool_path()
    test_graph_tool_path()
    print("SMOKE OK")
