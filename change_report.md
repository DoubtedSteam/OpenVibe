# 多语言支持 (vibe-coding.language) — 修改追踪报告

> 生成时间: 2026-04-24
> 编译验证: ✅ tsc --noEmit 通过
> 涉及文件: 6 个（5 个源文件 + 1 个文档）

---

## 修改概览

| 文件 | 修改类型 | 说明 |
|------|---------|------|
| `package.json` | 新增配置项 | `vibe-coding.language` VS Code 设置（enum: auto/en/zh-CN） |
| `src/types.ts` | 新增字段 | `ApiConfig.language?: string` |
| `src/modules/UIManager.ts` | 修改逻辑 | `getApiConfig()` 读取 language 设置，auto 时自动检测 UI 语言 |
| `src/modules/MessageHandler.ts` | 新增方法 + 修改注入逻辑 | `_buildLanguageInstruction()` 动态注入语言指令到 system prompt |
| `src/toolDefinitions.ts` | 新增文档行 | Configuration 列表添加 Language 说明 |
| `.OpenVibe/memory.md` | 更新文档 | 设计原则 + ApiConfig 字段说明 |

---

## 详细文件差异

### 1. `package.json` — 新增配置项

**位置**: 第 88-98 行（在 `maxSequenceLength` 之后，`todolistReview.enabled` 之前）

```json
"vibe-coding.language": {
  "type": "string",
  "default": "auto",
  "enum": ["auto", "en", "zh-CN"],
  "enumDescriptions": [
    "Auto-detect based on user's VS Code display language (English if UI is English, Chinese if UI is Chinese)",
    "Always use English",
    "Always use Simplified Chinese"
  ],
  "description": "Language for AI assistant interaction. Controls the language used in system prompts, tool descriptions, and assistant responses."
}
```

**关键点**：
- `"auto"` 为默认值
- 三个选项均带 `enumDescriptions`，VS Code 设置 UI 会显示中文友好提示
- 用户可在 VS Code 设置中搜索 `vibe-coding.language` 找到

---

### 2. `src/types.ts` — 新增字段

**位置**: 第 69-70 行（在 `maxSequenceLength` 之后，接口闭合之前）

```typescript
  maxSequenceLength?: number;
  /** Language for AI interaction: 'auto' | 'en' | 'zh-CN' */
  language?: string;
}
```

**关键点**：
- `language` 为可选字段（`?`），兼容旧版配置
- JSDoc 注释说明合法值

---

### 3. `src/modules/UIManager.ts` — `getApiConfig()` 逻辑修改

**位置**: 第 93-117 行

```typescript
public getApiConfig(): ApiConfig {
    const cfg = vscode.workspace.getConfiguration('vibe-coding');
    const apiKey = cfg.get<string>('apiKey', '');
    if (!apiKey) {
      throw new Error('API key not configured. Please set vibe-coding.apiKey in Settings.');
    }
    // Resolve language setting: "auto" → detect from VS Code UI language
    const rawLang = cfg.get<string>('language', 'auto');
    let resolvedLang = rawLang;
    if (rawLang === 'auto') {
      const uiLang = vscode.env.language;
      // If UI language starts with "zh" (zh-CN, zh-TW, etc.), use zh-CN; otherwise use English
      resolvedLang = uiLang.startsWith('zh') ? 'zh-CN' : 'en';
    }
    return {
      baseUrl: cfg.get<string>('apiBaseUrl', 'https://api.openai.com/v1'),
      apiKey,
      model: cfg.get<string>('model', 'gpt-4o'),
      confirmChanges: cfg.get<boolean>('confirmChanges', true),
      confirmShellCommand: cfg.get<boolean>('confirmShellCommand', true),
      maxInteractions: cfg.get<number>('maxInteractions', -1),
      maxSequenceLength: cfg.get<number>('maxSequenceLength', 2000),
      language: resolvedLang,
    };
  }
```

**修改内容**（对比原版）:
- 新增第 99-106 行：`rawLang` 读取 + `auto` 分支检测 VS Code UI 语言
- 新增第 115 行：`language: resolvedLang` 传入返回对象

**解析逻辑**:
| VS Code UI 语言 | rawLang=auto 时 resolvedLang |
|----------------|----------------------------|
| `zh-CN`, `zh-TW`, `zh` 等 | `zh-CN` |
| `en`, `ja`, `de` 等 | `en` |

---

### 4. `src/modules/MessageHandler.ts` — 核心改动

#### 4a. system prompt 构建处注入语言指令

**位置**: 第 86-91 行

```typescript
// Build language instruction based on user's setting
const langInstr = this._buildLanguageInstruction(apiConfig.language);

const allMessages = this._context.buildMessagesForLlm(
  SYSTEM_PROMPT + `

` + getAgentRuntimeContextBlock() + langInstr + injectedSystemPrompt
);
```

**逻辑**:
- `langInstr` 在 system prompt + runtime context block 之后追加
- 语言指令出现在 `injectedSystemPrompt`（内部 nudge）之前，优先级更高

#### 4b. 新增 `_buildLanguageInstruction` 方法

**位置**: 第 256-274 行

```typescript
/**
 * Build a language instruction block appended to the system prompt.
 * Tells the AI to respond in the user's preferred language.
 */
private _buildLanguageInstruction(lang: string | undefined): string {
    switch (lang) {
      case 'zh-CN':
        return `

## Language Instruction
请使用简体中文回复用户。所有工具调用的说明和输出、错误处理、修改总结等都请使用中文。`;
      case 'en':
        return '';
      default:
        // Fallback: auto-detected but unknown — stay neutral
        return '';
    }
  }
```

**行为矩阵**:
| 设置值 | 注入的内容 | AI 行为 |
|--------|-----------|---------|
| `zh-CN` | 中文字段指令 | 用简体中文回复所有内容 |
| `en` | 空字符串 | 保持默认英文行为 |
| 未定义/未知 | 空字符串 | 保持默认英文行为 |

---

### 5. `src/toolDefinitions.ts` — 配置说明

**位置**: 第 469 行（`Max Sequence Length` 之后）

```markdown
- **Language**: Language for AI interaction (auto/en/zh-CN, default: auto). When set to zh-CN, the AI should respond in Simplified Chinese. When set to en, respond in English. "auto" detects from VS Code UI language.
```

这个说明会出现在 AI 的 system prompt 的 Configuration 章节，让 AI 自己知道有语言设置的存在。

---

### 6. `.OpenVibe/memory.md` — 文档更新

**Level 1 设计原则新增**（第 15 行）:
```markdown
- **多语言支持**：支持通过 VS Code 设置 vibe-coding.language 选择与AI交互的语言（auto/en/zh-CN），auto 模式自动检测 VS Code 界面语言
```

**Level 3 ApiConfig 新增字段**（第 245 行）:
```markdown
- `language` · string | undefined · AI交互语言（auto/en/zh-CN，默认auto，auto自动检测VS Code界面语言）
```

---

## 数据流

```
用户设置 (vibe-coding.language)
        │
        ▼
UIManager.getApiConfig()
   ├─ auto  → vscode.env.language 检测 → resolvedLang
   └─ en/zh-CN → 直接使用
        │
        ▼
ApiConfig.language 传给 MessageHandler
        │
        ▼
MessageHandler.handleUserMessage()
   └─ _buildLanguageInstruction(lang)
        ├─ "zh-CN" → 返回中文指令字符串
        └─ "en"/其他 → 返回 ""
              │
              ▼
      追加到 system prompt 后
              │
              ▼
       AI 模型用指定语言回复
```

---

## 编译验证

```bash
npx tsc --noEmit
# Exit code: 0 ✅ 无错误
```

## 修复记录

| 轮次 | 问题 | 修复方案 |
|------|------|---------|
| 1 | `types.ts` 第 72 行多余 `}` | 删除多余的闭合大括号 |
| 2 | `MessageHandler.ts` 第 89-91 行跨行字符串语法错误 | 改用模板字符串 + 实际换行符 |
| 3 | `MessageHandler.ts` 第 276 行多余 `}` | 删除多余闭合大括号 |
| 4 | `MessageHandler.ts` 第 267-268 行 `case 'en':` 重复 | 删除重复行 |
