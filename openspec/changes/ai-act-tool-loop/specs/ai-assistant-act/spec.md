## ADDED Requirements

### Requirement: Name overlap is recalled before the first model call
Before the first model call of an act turn, the system MUST compare the member's current text with item names in the current family and MUST inject matching rows into the prompt as recall facts. Matching MUST be substring overlap with catalog names, longest name first so a shorter name inside an already matched span is not also selected. Recall MUST NOT choose a write capability from the wording. Recalled rows MUST receive operable short refs for this turn. The recall section MUST be empty when no catalog name occurs in the text. A later probe in the same turn MUST NOT reuse those short ref numbers.

#### Scenario: Named goods appear before the model answers
- **WHEN** the family has 鸡蛋 and 盐 and the member says 鸡蛋和盐各加一个
- **THEN** the first model prompt contains both rows with quantity and place, and no write has run yet

#### Scenario: Unrelated text recalls nothing
- **WHEN** the member's text contains none of the family's item names
- **THEN** the recall section is empty and the model may still probe

#### Scenario: Longer name consumes the shorter span
- **WHEN** the family has both 大米 and 米 and the text contains 大米
- **THEN** recall includes 大米 and does not also treat the inner 米 as a separate hit

### Requirement: Tool loop replaces the one-shot JSON plan
The model MUST be able to call enabled capabilities as tools and read each tool result before the next step. A turn MUST stop after a bounded number of model steps. Writes that require confirmation MUST stop the loop and return the existing confirm card. Hard-denied capabilities MUST NOT execute. A final message that is a JSON object or array MUST NOT be parsed or executed as a plan. The member-facing statuses remain ask, confirm, and done.

#### Scenario: Search then update stays inside one turn
- **WHEN** the member asks to add one to an existing item and the first tool result shows its current quantity
- **THEN** a later step in the same turn may update that row to the absolute quantity, without a second client request

#### Scenario: Delete still confirms
- **WHEN** the model calls a capability marked confirm
- **THEN** the system returns a confirm payload and does not write until the member confirms

#### Scenario: JSON text does not write
- **WHEN** the model returns a JSON object containing calls and no tool call
- **THEN** those calls are not executed and the member does not see the raw JSON

## MODIFIED Requirements

### Requirement: Create-class failure triggers at most one model replan
工具循环下不再有独立的「重编排轮」：create 类步骤失败时，失败结果作为工具结果在同一轮回喂给模型（可见 successes / failure / pending），后续步骤由模型自行决定；系统不得在代码里偷换空间或位置目标，不得仅为构建回执而扫全库。整轮仍受步数与时间预算约束。

#### Scenario: Location create fails inside the tool loop
- **WHEN** space.createLocation fails and later steps were pending
- **THEN** the failure is returned to the model as a tool result within the same turn and no code-level degrade placement is invented

#### Scenario: No separate replan round
- **WHEN** a later create-class step also fails
- **THEN** the loop stays within its step and time budget and no additional planning round is started

### Requirement: page.get bodies inject like progressive knowledge
page.get 的目录/契约正文作为工具结果在同一轮回喂给模型，不再有独立的再次调用轮。注入的页面文本不得自行授权领域写操作；禁止臆造注册表之外的 path。

#### Scenario: Fetch then answer with page facts
- **WHEN** the loop calls page.get for the item-edit contract and the body is returned
- **THEN** a later step in the same turn may see that contract text and MUST still use only catalog tools for any further side effects
