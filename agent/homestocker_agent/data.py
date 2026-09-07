"""数据模型 + DataBackend 接口 + MockBackend（内存 mock）。

后续接入云开发（CloudBase）时，实现一个新的 DataBackend 即可，
工具与图逻辑无需改动。
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Optional, Protocol


@dataclass
class Item:
    id: str
    family_id: str
    name: str
    category: str
    quantity: float
    unit: str
    location: str
    expire_date: Optional[str]  # YYYY-MM-DD
    notes: str
    status: str  # normal / expiring / expired / used

    def as_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "category": self.category,
            "quantity": self.quantity,
            "unit": self.unit,
            "location": self.location,
            "expire_date": self.expire_date,
            "status": self.status,
        }


@dataclass
class Family:
    id: str
    name: str
    locations: list[str]
    categories: list[str]

    def as_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "locations": self.locations,
            "categories": self.categories,
        }


class DataBackend(Protocol):
    def resolve_family_id(self, user_id: str) -> str: ...

    def get_family(self, family_id: str) -> Optional[Family]: ...

    def search_items(
        self,
        family_id: str,
        query: str = "",
        category: str = "",
        location: str = "",
        status: str = "",
    ) -> list[Item]: ...

    def list_expiring(self, family_id: str, days: int = 3) -> list[Item]: ...

    def add_item(
        self,
        family_id: str,
        name: str,
        quantity: float,
        unit: str,
        location: str,
        category: str = "",
        expire_date: str = "",
        notes: str = "",
    ) -> Item: ...


class MockBackend:
    """内存 mock 后端，预置一个家庭与几条物资（含临期/过期）。"""

    def __init__(self) -> None:
        today = date.today()
        self._families = {
            "family-demo": Family(
                id="family-demo",
                name="自己家",
                locations=["冰箱冷藏", "冰箱冷冻", "厨房柜", "阳台"],
                categories=["食品饮料", "生鲜果蔬", "调味品", "药品保健", "日用品"],
            )
        }
        self._user_family = {"demo-user": "family-demo"}
        self._items: dict[str, list[Item]] = {
            "family-demo": [
                Item("i1", "family-demo", "牛奶", "生鲜果蔬", 2, "盒", "冰箱冷藏",
                     (today + timedelta(days=3)).isoformat(), "", "expiring"),
                Item("i2", "family-demo", "鸡蛋", "生鲜果蔬", 1, "盒", "冰箱冷藏",
                     (today + timedelta(days=13)).isoformat(), "", "normal"),
                Item("i3", "family-demo", "大米", "食品饮料", 1, "袋", "厨房柜",
                     None, "", "normal"),
                Item("i4", "family-demo", "感冒药", "药品保健", 1, "盒", "阳台",
                     (today - timedelta(days=2)).isoformat(), "", "expired"),
            ]
        }
        self._seq = 100

    # ---- DataBackend ----

    def resolve_family_id(self, user_id: str) -> str:
        return self._user_family.get(user_id, "family-demo")

    def get_family(self, family_id: str) -> Optional[Family]:
        return self._families.get(family_id)

    def search_items(
        self,
        family_id: str,
        query: str = "",
        category: str = "",
        location: str = "",
        status: str = "",
    ) -> list[Item]:
        items = [i for i in self._items.get(family_id, []) if i.status != "used"]
        if query:
            q = query.lower()
            items = [i for i in items if q in i.name.lower() or q in (i.notes or "").lower()]
        if category:
            items = [i for i in items if i.category == category]
        if location:
            items = [i for i in items if i.location == location]
        if status:
            items = [i for i in items if i.status == status]
        return items

    def list_expiring(self, family_id: str, days: int = 3) -> list[Item]:
        today = date.today()
        out: list[Item] = []
        for i in self._items.get(family_id, []):
            if i.status == "used" or not i.expire_date:
                continue
            try:
                d = date.fromisoformat(i.expire_date)
            except ValueError:
                continue
            if (d - today).days <= days:  # 临期 + 已过期
                out.append(i)
        return out

    def add_item(
        self,
        family_id: str,
        name: str,
        quantity: float,
        unit: str,
        location: str,
        category: str = "",
        expire_date: str = "",
        notes: str = "",
    ) -> Item:
        self._seq += 1
        status = "normal"
        if expire_date:
            try:
                delta = (date.fromisoformat(expire_date) - date.today()).days
                if delta < 0:
                    status = "expired"
                elif delta <= 3:
                    status = "expiring"
            except ValueError:
                pass
        item = Item(
            id=f"i{self._seq}",
            family_id=family_id,
            name=name,
            category=category,
            quantity=quantity,
            unit=unit,
            location=location,
            expire_date=expire_date or None,
            notes=notes or "",
            status=status,
        )
        self._items.setdefault(family_id, []).append(item)
        self._ensure_location(family_id, location)
        if category:
            self._ensure_category(family_id, category)
        return item

    # ---- helpers ----

    def _ensure_location(self, family_id: str, location: str) -> None:
        fam = self._families[family_id]
        if location and location not in fam.locations:
            fam.locations.append(location)

    def _ensure_category(self, family_id: str, category: str) -> None:
        fam = self._families[family_id]
        if category and category not in fam.categories:
            fam.categories.append(category)
