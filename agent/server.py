"""FastAPI 入口（V1 非流式）。"""

import os

from dotenv import load_dotenv
from fastapi import FastAPI
from langchain_core.messages import HumanMessage
from pydantic import BaseModel

from homestocker_agent.data import MockBackend
from homestocker_agent.graph import build_graph

load_dotenv()

app = FastAPI(title="HomeStocker Agent", version="0.1.0")

# MVP：用内存 mock 数据；后续替换为云开发（CloudBase）后端
graph = build_graph(backend=MockBackend())


class ChatRequest(BaseModel):
    user_id: str = "demo-user"
    message: str


class ChatResponse(BaseModel):
    reply: str
    family_id: str = ""
    family_name: str = ""


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest) -> ChatResponse:
    result = graph.invoke(
        {"messages": [HumanMessage(content=req.message)], "user_id": req.user_id}
    )
    last = result["messages"][-1]
    reply = last.content if hasattr(last, "content") else str(last)
    return ChatResponse(
        reply=reply,
        family_id=result.get("family_id", ""),
        family_name=result.get("family_name", ""),
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server:app", host="127.0.0.1", port=int(os.getenv("PORT", "8000")))
