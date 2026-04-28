# OpenVibe 代码结构重构计划

> **目标**：将当前代码结构从"大文件单体"重构为"按职责分组的模块化结构"
> **约束**：每个阶段完成后，`tsc --noEmit` 必须零错误通过
> **当前状态**：编译通过，0 错误（2026-04-02 baseline）

---

## Phase 1：清理空目录（幽灵文件）

**风险**：★☆☆☆☆（零风险，只删除空目录）
**编译**：✅ 不受影响

| 路径 | 当前状态 | 操作 |
|------|---------|------|
| `src/storageManager.ts` | 空目录 | 删除 |
| `src/fileStorage.ts` | 空目录 | 删除 |
| `src/sessionStorage.ts` | 空目录 | 删除 |
| `src/storage.ts` | 空目录 | 删除 |
| `src/storage/` | 空目录 | 删除 |
| `src/types/` | 空目录 | 删除 |
| `src/utils/storage.ts` | 空目录 | 删除 |

**说明**：这些路径在 memory.md 中被记录为存储模块文件，但实际是空目录。这是历史遗留问题，可能是之前构建过程或文件操作失误产生的。删除后需要同步更新 memory.md。

---

## Phase 2：提取工具函数到 `src/utils/`

**风险**：★★☆☆☆（内部函数重定位，不改变导出接口）
**编译**：每创建/修改一个文件后立即验证

将 `src/tools.ts` 中的纯工具函数提取到独立模块中：

### 2a. 创建 `src/utils/pathHelpers.ts`
从 tools.ts:39-111 提取：
- `getWorkspaceRoot()` 
- `resolveWorkspacePath()`
- `workspaceFileExistsRelative()`
- `readLines()` / `writeLines()`
- `splitLinesForEditInput()` / `splitLinesNormalized()`
- `inferCrlfForNewFile()`

### 2b. 创建 `src/utils/htmlParser.ts`
从 tools.ts:1479-1561 提取：
- `htmlToPlainText()`
- `extractTitle()`
- `extractLinks()`
- `extractMetaDescription()`
- `isPrivateHost()`

### 2c. 创建 `src/utils/frontmatter.ts`
从 tools.ts:1214-1254 提取：
- `parseFrontmatter()`

### 2d. 修改 `src/tools.ts`
- 将上述函数替换为 `export * from './utils/pathHelpers'` 等 re-export
- 保持所有对外导出接口不变

**验证**：导入方（ToolExecutor.ts, UIManager.ts 等）的 `import` 路径不变，编译应直接通过。

---

## Phase 3：拆分 `tools.ts` 为多文件模块（核心阶段）

**风险**：★★★★☆（需处理文件重命名、目录创建、所有导入路径）
**编译**：每个文件创建后立即验证

### 策略（避免 Windows 大小写冲突）
1. 先将 `src/tools.ts` 重命名为 `src/tools.all.ts`
2. 创建 `src/tools/` 目录
3. 逐步创建各个子模块文件
4. 创建 `src/tools/index.ts` 汇总 re-export
5. 逐一更新所有 `from '../tools'` → `from '../tool'`... 等等

不对，对于 Windows，需要先处理命名冲突。正确策略：

1. 重命名 `src/tools.ts` → `src/old_tools.ts`
2. 创建 `src/tools/` 目录
3. 创建各个拆分文件
4. 创建 `src/tools/index.ts` 统一导出
5. 更新所有 import 路径
6. 删除 `src/old_tools.ts`
7. 验证编译

### 拆分结构

```
src/tools/
├── index.ts              # Re-export 所有工具
├── readFileTool.ts       # readFileTool
├── findInFileTool.ts     # findInFileTool
├── replaceLinesTool.ts   # replaceLinesTool (核心)
├── workspaceTools.ts     # getWorkspaceInfo, createDirectory, getFileInfo, getDiagnostics
├── notificationTools.ts  # showNotification, askHuman
├── shellTool.ts          # runShellCommand
├── webFetchTool.ts       # webFetch (含 HTML 解析)
├── gitTools.ts           # gitSnapshot, gitRollback, listGitSnapshots
├── skillTools.ts         # skill 相关所有函数
├── grepSearchTool.ts     # grepSearch
└── helpers.ts            # 全局技能池变量 + setGlobalSkillsDir
```

### 文件大小对比

| 文件 | 当前 | 重构后 |
|------|------|--------|
| `tools.ts` | 1737 行 | ❌ 删除 |
| `tools/index.ts` | - | ~30 行 |
| `tools/replaceLinesTool.ts` | - | ~280 行 |
| 其他每个工具文件 | - | 30~110 行 |

---

## Phase 4：精简 `ToolExecutor.ts` + 合并安全检测

**风险**：★★★☆☆（需提取方法并重新组织）
**编译**：每次改动后验证

### 4a. 提取安全检测函数到 `shellCommandReview.ts`
从 `ToolExecutor.ts:42-131` 移动：
- `detectShellFileOpBypass()`
- `detectShellContextHarvest()`
- `shouldEarlyStopOnShellReviewFail()`

### 4b. 将 todo list 审查循环提取到 `todolistReview.ts`
从 `ToolExecutor.ts:815-1053` 的完整审查逻辑考虑是否可提取。这部分与 ToolExecutor 的 `_context` 依赖紧密，如果提取太困难可以推迟。

### 4c. 精简 `ToolExecutor.ts`
减少约 200-300 行。

---

## Phase 5：分离 `toolDefinitions.ts` 的 SYSTEM_PROMPT

**风险**：★★☆☆☆（纯拆分，无逻辑变更）
**编译**：直接通过

### 5a. 创建 `src/systemPrompt.ts`
将 `toolDefinitions.ts:526-746` 的 `SYSTEM_PROMPT` 常量移入新文件

### 5b. 修改 `src/toolDefinitions.ts`
- 删除 `SYSTEM_PROMPT`
- 添加 `export { SYSTEM_PROMPT } from './systemPrompt'`

### 文件大小变化
- `toolDefinitions.ts`: 746 → ~525 行（仅保留工具定义）
- `systemPrompt.ts`: 新建 ~220 行

---

## Phase 6：边界清理和死代码处理

**风险**：★★☆☆☆（非核心路径）
**编译**：每次改动后验证

### 6a. 处理 `MessageHandler.ts:8` 中工具导入的精简化
将 `import { gitSnapshotTool } from '../tools'` 更新为从新路径导入

### 6b. ConversationService 辅助方法清理
- `getLastUserTextForTools()` — 仅被 ToolExecutor 使用时移至更合适位置
- `getRelatedContextForTodolistReview()` — 同上
- `truncateBeforeUserMessage()` — 仅被 git rollback 调用

### 6c. `streamChatMessage` 处理
`src/api.ts:123-309` 的 SSE 流式实现已实现但未在主流程中启用。暂保留但添加注释标记。

---

## 执行顺序总结

```
Phase 1  →  清理空目录          →  tsc --noEmit ✅
    ↓
Phase 2  →  提取 utils 函数     →  tsc --noEmit ✅
    ↓
Phase 3  →  拆分 tools.ts       →  tsc --noEmit ✅（核心阶段）
    ↓
Phase 4  →  精简 ToolExecutor   →  tsc --noEmit ✅
    ↓
Phase 5  →  分离 SYSTEM_PROMPT  →  tsc --noEmit ✅
    ↓
Phase 6  →  边界清理            →  tsc --noEmit ✅
```

---

## 重要注意事项

1. **Windows 文件名冲突**：`src/tools.ts` 和 `src/tools/` 在 Windows 不区分大小写，必须先重命名文件再创建目录
2. **分步验证**：Phases 2-3 需要拆分为子步骤，每创建/修改一个文件后立即 `tsc --noEmit`
3. **memory.md 同步**：每次修改文件结构后同步更新 `.OpenVibe/memory.md`
4. **测试保留**：重构仅改变代码组织，不改变行为逻辑
5. **import 路径**：修改 import 路径时要同步更新所有引用点