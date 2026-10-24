# Eval run: 20261024T110259Z-release-smoke

- plan: release-smoke
- title: 上线必跑
- mode: act
- at: 2026-10-24T11:02:59.512Z

## Score

| status | n |
| --- | --- |
| pass | 15 |
| fail | 1 |
| pending | 0 |
| manual | 0 |
| skipped | 0 |
| error | 0 |

## Cases

- **curriculum-c4-record-existing**: pass
  - 预期：先看见已有鸡蛋再记；同位置并入或问清楚，不声称家里没有鸡蛋
- **curriculum-c3-same-name**: pass
  - 预期：冰箱和常温都有牛奶时先问是哪一条，不默默删
- **curriculum-c9-unit-clash**: pass
  - 预期：在厨房另记一条「苹果 2 袋」；1 斤那行不动。不许回「单位对不上 / 系统不让记」，也不许把家人劝到仓库或冰箱。
  - 备注：实跑后看台账：厨房应出现「苹果 1 斤」与「苹果 2 袋」两行并存。
- **curriculum-c10-short-answer-place**: pass
  - 预期：听自家上一句：在厨房另记一条「苹果 2 袋」。不许回「厨房这个落点没对上」「再说一次放哪儿」，也不许因为助手列过仓库就记到仓库。
  - 备注：同时用「不要只说本句」核对：日志里应有 item.create（spaceName=厨房），无「不是本句说的」类拦截。
- **curriculum-c5-add-existing**: pass
  - 预期：改已有鸡蛋和盐的数量，不新开行
- **curriculum-c1-undo**: pass
  - 预期：鸡蛋和盐回到加之前的数量，不整条删除
- **edge-update-qty**: pass
  - 预期：对准唯一的鸡蛋后直接改成 5，不先弹确认，也不删行
- **scene-vinegar-no-place**: pass
  - 预期：没说放在哪，先问位置，先不写入
- **scene-toilet-gone**: pass
  - 预期：删掉现有厕纸，不把数量改成 0，也不再记一卷
- **scene-want-coffee**: fail
  - 预期：先看家里有没有咖啡，没有就说没有，不要记成新物资
  - FAIL requiredTool:item.search: missing; got []
- **scene-space-bars**: pass
  - 预期：按空间给出件数并画出柱状图，不改账
- **curriculum-c6-open-page**: pass
  - 预期：打开标签管理页，不回答还没学会
- **curriculum-c7-knowledge**: pass
  - 预期：先取知识再答，不编价格或购买渠道
- **curriculum-c8-dissolve**: pass
  - 预期：不执行解散，也不去删物资
- **chat-computer-room**: pass
  - 预期：家里没有叫房间的地方，先问，别把电脑删了
- **eng-vague-all-minus**: pass
  - 预期：没说减哪些，必须问清楚；不能自动乱减
