## Context

通话链路目前是：`pickMimoKey()` 取家庭第一把 `provider=mimo` 的密钥 → 用 `key.model()` 调对话接口 → 用同一个 `key` 调 TTS。密钥行上的 `model` 本来是为管家选的，通话被动跟随。

一次真实故障暴露了这层耦合：管家侧把模型改成 `mimo-v2.6-pro` 后，通话卡在「等待回复超时」，而根因（该型号流式只发心跳）在通话侧完全不可见。

## Goals / Non-Goals

**Goals**

- 通话的对话模型、音色由家庭单独配置，管家侧改密钥不再影响通话
- 配置缺失时行为与今天一致，不要求存量家庭做任何操作
- 密钥仍只存一份明文，避免双写不一致

**Non-Goals**

- 不做通话的写库能力（加/减/改物品），本次只解耦配置
- 不改通话的流式协议与分句策略
- 不改管家的密钥选择逻辑

## Decisions

### 独立表而非给 `family_ai_keys` 加字段

`family_ai_keys` 的语义是「这个家庭能用哪些上游密钥」，一把密钥天然可被多处使用。给它加 `purpose` 会把「密钥」和「用途」混成一张表，同一把 key 想两用就得存两行明文，反而引入不一致。

新表 `family_voice_settings` 以 `family_id` 为主键，只存三件事：

```
family_id  text  PK → families(id) ON DELETE CASCADE
key_id     text  NULL → family_ai_keys(id) ON DELETE SET NULL
model      text  NOT NULL
voice      text  NOT NULL DEFAULT ''
updated_at timestamptz
```

`ON DELETE SET NULL` 保证密钥被删后配置行不变成悬空指针，通话自动回退。

### 存指针不存密钥

`key_id` 指向既有密钥行，`api_key` / `base_url` 仍从 `family_ai_keys` 读。理由：

- 明文只有一份，轮换密钥时通话同时生效
- 用户不需要在通话设置里再粘一次 API Key
- 想给通话换独立账号时，改 `key_id` 指向另一把即可，表结构不用动

### 模型白名单放在 voice 模块内

不通用的模型目录（`ModelCatalog`）是给密钥页和管理器用的，衡量的是「能不能对话」。通话多一条约束：**能不能流式出字**。已知 `mimo-v2.6-pro`、`mimo-v2.6-flash` 当前流式只发心跳，但它们在通用目录里是合法模型。

因此白名单落在 `voice/app`，只列实测可流式的型号。放这里还有一个好处：上游修好后只改这一个文件，不影响管家可选项。

白名单初始为 `mimo-v2.6-pro-ultraspeed`（默认）、`mimo-v2.5-pro`、`mimo-v2.5`。

### 解析优先级

```
settings.model（且在白名单） → 默认模型
settings.key_id（且属于本家、provider=mimo） → 该家第一把 mimo 密钥
settings.voice → 请求体 voice → "mimo_default"
```

任何一环失效都单独回退，不整体报错：配置行缺失、模型不在白名单、指向的密钥被删，都退回默认值继续通话。只有「该家一把 mimo 密钥都没有」才报错，与今天一致。

### 接口

沿用 `/api/voice/call` 前缀：

- `GET /api/voice/call/settings`：返回 `model`、`voice`、`keyId`，以及可选模型清单、该家可选密钥清单、当前生效值
- `POST /api/voice/call/settings`：upsert，`model` 必须在白名单，`keyId` 必须属于本家且 `provider=mimo`（可为 null 表示自动）

响应里同时给「已保存值」和「生效值」，前端不用自己算回退。

## Risks / Trade-offs

- **多一张表**：换来的是两条链路互不影响，值得。表很小，一行一个家庭。
- **白名单会过期**：上游修复 `v2.6-pro` 后需要人工加回。用注释标注每个型号的验证日期与现象，降低下次排查成本。
- **音色仍由客户端传**：本次只把服务端默认音色纳入配置，客户端音色列表不动，避免同时改两端。配置为空时行为与今天完全一致。

## Migration Plan

1. 上线迁移，建表（无数据回填）
2. 服务端先读配置、缺失时走默认——此时行为与上线前一致
3. 小程序设置页上线后，用户保存才产生配置行
4. 回滚：删除设置页入口即可，服务端读不到配置行会自动走默认，不需要回滚数据

## Open Questions

无
