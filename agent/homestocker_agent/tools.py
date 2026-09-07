"""V1 的 4 个工具。

说明：`family_id` 作为每个工具的最后一个可选参数暴露在 schema 中，
但由 `call_tool` 节点用 state["family_id"] 强制覆盖，LLM 无法借此越权。
"""

from typing import Optional

from langchain_core.tools import tool

from .data import DataBackend


def build_tools(backend: DataBackend) -> list:
    @tool
    def get_current_family(family_id: str = "") -> dict:
        """获取当前家庭信息：名称、可用存放位置、可用分类。"""
        fam = backend.get_family(family_id)
        if not fam:
            return {"ok": False, "error": "未找到家庭"}
        return {"ok": True, "family": fam.as_dict()}

    @tool
    def search_items(
        query: str = "",
        category: str = "",
        location: str = "",
        status: str = "",
        family_id: str = "",
    ) -> list[dict]:
        """查询当前家庭物资：可按名称关键词(query)、分类、存放位置、状态筛选。"""
        items = backend.search_items(
            family_id, query=query, category=category, location=location, status=status
        )
        return [i.as_dict() for i in items]

    @tool
    def list_expiring(days: int = 3, family_id: str = "") -> list[dict]:
        """查询临期/过期物资。days 表示未来多少天内到期（默认 3），已过期的也一并返回。"""
        items = backend.list_expiring(family_id, days=days)
        return [i.as_dict() for i in items]

    @tool
    def add_item(
        name: str = "",
        quantity: Optional[float] = None,
        unit: str = "",
        location: str = "",
        category: str = "",
        expire_date: str = "",
        notes: str = "",
        family_id: str = "",
    ) -> dict:
        """新增一条物资。必需：name、quantity、unit、location；可选：category、expire_date(YYYY-MM-DD)、notes。"""
        missing = []
        if not name:
            missing.append("名称")
        if quantity is None:
            missing.append("数量")
        if not unit:
            missing.append("单位")
        if not location:
            missing.append("位置")
        if missing:
            return {"ok": False, "missing": missing, "error": "缺少必需字段：" + "、".join(missing)}
        item = backend.add_item(
            family_id,
            name=name,
            quantity=quantity,
            unit=unit,
            location=location,
            category=category,
            expire_date=expire_date,
            notes=notes,
        )
        return {"ok": True, "item": item.as_dict()}

    return [get_current_family, search_items, list_expiring, add_item]
