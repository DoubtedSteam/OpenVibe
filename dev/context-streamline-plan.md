# 上下文系统精简计划(OpenVibe)

> 记录日期:2026-08-23
> 状态:🟢 第一批已完成(tsc + 对话实测通过);第二批已完成(2026-08-24,tsc 通过,待实测)
> 目标:消除 LLM 上下文中无信息增益的重复副本,降低 token 开销,不改动任何行为语义。

## 一、排查验证结果(已逐行核实源码)

| # | 冗余点 | 核实结论 | 位置 |
|---|--------|---------|------|
| 1 | 工具规则双重描述(散文 + JSON schema) | ✅ 成立 | `systemPrompt.ts:11-29` ↔ `toolDefinitions.ts` 各 `description`(edit:89-100 / shell:309-318 / grep:437-443) |
| 2 | 宿主环境双重注入 | ✅ 成立(修正:第二份仅在调用 get_workspace_info 后出现) | `agentRuntimeContext.ts:49-66` ↔ `:83-99`(`workspaceTools.ts:83`) |
| 3 | shell 原文 + summary/keyErrors 子集 | ⚠️ 部分成立(summary/keyErrors 在 stdout 截断时有独立价值;纯重复的是 command 回带) | `shellTool.ts:69-103, 256` |
| 4 | task_complete 文件列表三份 | ✅ 成立 | `MessageHandler.ts:290-306` |
| 5 | edit 结果 before/after/diff 三视图 | ⚠️ 修正:主模型只收到 unifiedDiff;冗余在审查请求侧 | `replaceLinesTool.ts:119-164, 190-197` |
| 6 | todo 整表反复回传 | ✅ 成立 | `ToolExecutor.ts:342-350, 852-859` |
| 7 | 压缩请求携带全量工具定义 | ✅ 成立 | `historyCompactor.ts:148` |

## 二、精简计划

### 第一批:P1-1 ~ P1-4(纯删除,零风险)

| 编号 | 内容 | 位置 | 收益 |
|------|------|------|------|
| P1-1 | 工具散文列表 → 3 行指引 | `systemPrompt.ts:11-29` | 每轮省 ~900 tokens |
| P1-2 | 移除 get_workspace_info 的环境冗余 | `workspaceTools.ts:83`、`agentRuntimeContext.ts:82-99` | 每次调用省 ~100 tokens |
| P1-3 | 压缩请求去掉 TOOL_DEFINITIONS | `historyCompactor.ts:148` | 每次压缩省 ~4-6k tokens |
| P1-4 | task_complete 的 memoryHint 去掉文件列表 | `MessageHandler.ts:298-301` | 每轮收尾省几十~几百 tokens |

### 第二批:P2-1 ~ P2-3(已执行,2026-08-24)

| 编号 | 内容 | 位置 | 备注 |
|------|------|------|------|
| P2-1 | shell 结果去掉 command 回带(保留 originalToolCommand / keyErrors / summary) | `shellTool.ts` 4 个返回分支 | 审查与 UI 依赖项保留;已执行 |
| P2-2 | complete_todo_item 不再整表回传 | `ToolExecutor.ts:340-347` | create_todo_list 保留一次回传;已执行 |
| P2-3 | 审查请求只传 unifiedDiff(**增强:带 ±3 行上下文**),删 before/after 构造 | `replaceLinesTool.ts` / `codeEditReview.ts` / `UIManager.ts` | 用户 diff preview 不依赖 before/after;已执行 |

### 明确不动

- shell stdout 全量回传(500KB 上限是故意设计,截断丢信息)
- `📋 Todo: N remaining` 状态注入(状态感知必要信号)

## 三、执行状态

- [x] 排查验证(2026-08-23)
- [x] P1-1 精简 systemPrompt.ts 工具散文列表
- [x] P1-2 移除 getRuntimeEnvironmentSummary
- [x] P1-3 historyCompactor 去掉 TOOL_DEFINITIONS
- [x] P1-4 memoryHint 去掉文件列表
- [x] tsc --noEmit 验证(exit 0)
- [x] 第一批实测验证(2026-08-23 当前对话实测,见「五、实测记录」)
- [x] 第二批执行(2026-08-24,P2-1 ~ P2-3,tsc exit 0,见「六、第二批执行记录」)

## 四、验证方式

1. 每批改完 `tsc --noEmit`;
2. 实测一轮完整对话:检查 get_workspace_info / complete_todo_item / task_complete 的回传内容;
3. 日志确认压缩请求不再带 tools。

## 五、实测记录(2026-08-23 当前对话)

| 验证项 | 结果 | 证据 |
|--------|------|------|
| 系统提示工具区(P1-1) | ✅ 精简版生效:仅 schema 指引 + 3 条 critical rules,无散文列表 | 当前对话实际收到的 system prompt;二进制彩蛋行与 `systemPrompt.ts:5` 一致,证明实例加载含 P1 改动的构建 |
| get_workspace_info 回传(P1-2) | ✅ 仅 `workspaceRoot`/`topLevelEntries`/`hint` 三字段,无 OS/路径/行尾/Shell 冗余 | `.OpenVibe/sessions/session_1787495935084_hebzjw57o.json` 中 tool 回传原文 |
| 压缩请求不带 tools(P1-3) | ✅ 代码级确认:`historyCompactor.ts:144-149` 传 `tools=undefined`,`api.ts:75-79` 仅非空时写入 payload | 源码链;本对话未触发压缩,长对话触发后再补实测 |
| task_complete 回传(P1-4) | ✅ `memoryHint` 已无文件列表(源码级);本对话的 task_complete 回传写入会话文件 | `MessageHandler.ts:298-300`;回传内容可于会话文件中查验 |

> 备注:本次实测采用「当前对话 + 会话文件」双重证据,无需另行构造测试对话。

## 六、第二批执行记录(2026-08-24)

| 编号 | 改动 | 文件 | 验证 |
|------|------|------|------|
| P2-1 | 删除 4 个返回分支的 command 回带(预中断/超时中断/spawn error/close),仅保留 spawn 执行变量;`originalToolCommand` 审查依赖不受影响 | `shellTool.ts` | tsc exit 0;`result.command`/`toolResult.command` 全 src 零消费;schema 未承诺返回字段 |
| P2-2 | complete_todo_item 结果去掉 todoList 整表;`postUpdateDisplay` UI 更新保留;advance_todo_item 本就无整表;create_todo_list 按计划保留一次回传 | `ToolExecutor.ts` | tsc exit 0;schema 未承诺 todoList;UI 走独立 post 通道 |
| P2-3 | unifiedDiff 改为**带 ±3 行上下文**(- 行原行号 / + 行新行号 / 空格前缀上下文);审查请求与用户确认只传 unifiedDiff;`ReplaceCheckContext` 删 beforeContext/afterContext | `replaceLinesTool.ts` / `codeEditReview.ts` / `UIManager.ts` | tsc exit 0;webview 按 -/+ 前缀高亮、上下文行普通显示,兼容;全 src 无 beforeContext/afterContext 残留 |

> 待实测:跑一轮真实对话验证 ① shell 回传无 command ② complete_todo_item 回传无整表 ③ edit 审查卡片显示带上下文的 diff(上下文行以普通样式显示)。

## 七、vsix 打包验证(2026-08-24)

- 产物:`openvibe/vibe-coding-assistant-0.10.0-20260824.vsix`(670 文件,4.6MB;`npm run compile` + `npx @vscode/vsce package`)
- 检查方式:`openvibe/_tmp/check-p2.js` 对 prepublish 产物 `out/extension.js` 做特征字符串断言(不输出文件内容)
- 结果:**11/11 PASS** —— P1-1 精简提示/P1-2 工具回传/P1-3 压缩标记/P1-4 memoryHint 均在产物中;P2-1 无 command 回带、P2-2 无 todoList 字段、P2-3 带上下文 unifiedDiff 且无 before/after 残留
- 待人工实测:安装该 vsix 后跑一轮真实对话(见「六」待实测项)。
- 2026-08-24 vsix 已安装,第二轮实测中(P2-1/P2-2 已通过,见「八、vsix 安装实测」)。

## 八、vsix 安装实测(2026-08-24,当前对话)

| 验证项 | 实测结果 | 物证(会话文件 `.OpenVibe/sessions/session_1787495935084_hebzjw57o.json`) |
|--------|---------|------|
| P2-1 shell 无 command 回带 | ✅ 通过 | 2467 行:`{"success":true,"cwd":...,"exitCode":0,"signal":null,"durationMs":463,"stdout":"v24.16.0\r\n",...,"originalToolCommand":"node --version"}` — 无 `command` 字段 |
| P2-2 complete_todo_item 无整表 | ✅ 通过 | 2429 行:`{"success":true,"message":"Item 1 complete: ...","remaining":3}` — 无 `todoList` |
| P2-3 edit 回传带上下文 diff | ✅ 通过 | 2490 行:unifiedDiff 含 3 行空格前缀上下文(`   83:`/`   84:`/`   85:`) + `- 86:` 删除行 + `+ 86:`/`+ 87:` 新增行 |

- 顺带确认:create_todo_list 保留一次整表回传 ✓(与计划一致);当前实例即为 0.10.0-20260824 产物(P2-1/P2-2/P2-3 行为均与新版源码一致)。

## 九、第三批排查候选(P3,2026-08-26 排查)

> 基于 P1/P2 完成后的最新源码逐项复核,按 收益/风险 排序。

### P3-A:零风险纯删除(建议直接执行)

| 编号 | 内容 | 位置 | 收益 | 验证依据 |
|------|------|------|------|---------|
| P3-A1 | edit 回传删除 `diagnosticsCheck`(**硬编码空对象**,永远 `{hasNewDiagnostics:false,count:0,diagnostics:[]}`) | `replaceLinesTool.ts:236-238, 261` | 每次编辑省 ~25 tokens | 全 src 仅构造处 1 处引用,零消费者 |
| P3-A2 | task_complete 回传删除 `modifiedFiles` 数组(P1-4 遗留;memoryHint 保留数量提示,文件清单仅前端 fileSummary) | `MessageHandler.ts:302-305` | 每轮收尾省几十~几百 tokens | `\.modifiedFiles` 全 src 零匹配;schema 未承诺返回字段 |

### P3-B:低风险精简(需取舍确认)

| 编号 | 内容 | 位置 | 收益 | 取舍 |
|------|------|------|------|------|
| P3-B1 | systemPrompt 的 3 条 critical rules(P1-1 残留)与 edit/shell/grep 的 schema description 内容重叠 → 压缩为 1 行指针("Host-enforced rules are in each tool's schema") | `systemPrompt.ts:15-18` | 每轮省 ~150-180 tokens | 规则权威移到 schema description(主调用每轮必带 schema;压缩请求无需这些规则) |
| P3-B2 | Active Editor 每轮注入(含光标行列)→ 仅文件路径/语言变化时注入 | `MessageHandler.ts:161-166` | 连续同文件操作时每轮省 ~40-80 tokens | 丢光标行列实时信息(低价值);需缓存上次注入指纹 |
| P3-B3 | edit 回传 `message` 字段("Replaced lines X-Y...")与 totalLines/linesDelta/unifiedDiff 重复 | `replaceLinesTool.ts:267` | 每次编辑省 ~40-60 tokens | ⚠️ webview 状态栏依赖 `parsed.message`(main.js:444),需同步改 UI 或保留 |

### P3-C:代码卫生(非上下文,顺手清理)

| 编号 | 内容 | 位置 |
|------|------|------|
| P3-C1 | `ConversationService._sanitizeMessageList` 死代码(仅定义无调用) | `ConversationService.ts:295-297` |
| P3-C2 | `UIManager.llmCheckReplace` 死代码路径(注入链已切 codeEditReview)+ ToolExecutor 接口字段 | `UIManager.ts:159-222` / `ToolExecutor.ts:93` |
| P3-C3 | `agentRuntimeContext.ts:82-91` P1-2 删除后残留的注释错位 | `agentRuntimeContext.ts` |
| P3-C4 | shell 回传 `cwd` 每轮相同(工作区根)微冗余 | `shellTool.ts` 各分支 |
| P3-C5 | `get_file_info` 回传 `mtimeMs`+`mtimeIso` 双字段重复 | `workspaceTools.ts:225-226` |

### 明确不动(复核确认)

- 压缩请求全量 SYSTEM_PROMPT(KV 前缀命中设计,压缩任务无需精简版)
- `📋 Todo: N remaining` 注入、`🔓 Edit: ON/OFF`(极短,改动收益低于风险)
- shell stdout 全量回传、Memory Sync 消息(按需注入非冗余)
- `systemPrompt.ts:5` 二进制彩蛋行(用户刻意保留,~40 tokens)

> 建议:P3-A 可直接执行(纯删除);P3-B 逐项确认后执行;P3-C 随下一次重构顺手清理。

## 十、P3 执行记录(2026-08-26)

| 编号 | 内容 | 结果 |
|------|------|------|
| P3-A1 | edit 回传删除 `diagnosticsCheck` 硬编码空对象 | ✅ 已执行(`replaceLinesTool.ts`:删构造与回传字段,tsc 通过) |
| P3-A2 | task_complete 回传删除 `modifiedFiles` | ✅ 已执行(`MessageHandler.ts`:result 仅 success/operation/message/summary;前端 fileSummary 保留) |
| P3-B1 | systemPrompt critical rules 3 条 → 1 行 schema 指针 | ✅ 已执行(`systemPrompt.ts:15`:规则权威移至各工具 schema description) |
| P3-C1 | `ConversationService._sanitizeMessageList` 死代码 | ✅ 已删除(13 行) |
| P3-C2 | `UIManager.llmCheckReplace` 死代码路径 | ✅ 已删除(53 行 + 3 个 import + `_abortController` 字段);ToolExecutor 接口与 ChatViewProvider 注入保留(注入链仍活跃,非死代码) |
| P3-C3 | `agentRuntimeContext.ts` 注释错位 | ✅ 已修复(残留 language 注释块移除,getDateInfo 注释归位) |
| P3-C4 | shell 回传 `cwd` 微冗余(5 分支) | ✅ 已删除(零消费者;`root` 仍用于 spawn) |
| P3-C5 | `get_file_info` 回传 `mtimeIso` | ✅ 已删除(保留 `mtimeMs`) |

- 验证:`tsc --noEmit` exit 0;改动文件 VS Code 诊断全部干净。
- 未动:P3-B2(Active Editor 按需注入)、P3-B3(edit message 字段,webview 状态栏依赖) —— 按用户指示保留。
- 待办:重新打包 vsix 后实测(shell 回传无 cwd / task_complete 无 modifiedFiles / 系统提示规则指针)。

## 十一、P3 vsix 打包验证(2026-08-26)

- 产物:`openvibe/vibe-coding-assistant-0.10.0-p3.vsix`(670 文件,4.6MB;`extension.js` 465.81KB → 463.44KB)
- 检查:`openvibe/_tmp/check-p3.js`(P3 新检查 6 项 + P1/P2 回归 6 项)对 prepublish 产物断言
- 结果:**12/12 PASS** —— P3-A1 无 diagnosticsCheck、P3-A2 无 modifiedFiles、P3-B1 规则指针(旧标题已移除)、P3-C4 无 cwd、P3-C5 无 mtimeIso;P1-1/P1-3/P2-1/P2-2/P2-3 全部回归通过
- 待人工实测:安装该 vsix 后跑一轮真实对话(编辑/task_complete/shell 回传 + 系统提示规则指针)。