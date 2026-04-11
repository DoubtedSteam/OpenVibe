# OpenVibe Git 快照功能指南

## 概述
OpenVibe 提供了一个内置的 Git 快照功能，可以在重要操作前自动保存项目状态。

## 功能特点

### 1. 自动快照创建
- **触发时机**：当您发送任何聊天消息时自动创建
- **保存内容**：当前所有未提交的更改
- **标识符**：每个快照有唯一 ID 和时间戳

### 2. 快照管理
- **查看**：通过工具栏的 "Snapshots" 按钮
- **回滚**：支持恢复到任意历史快照
- **存储**：Git 标签格式：`vibe-snapshot-{sessionId}-{snapshotId}`

### 3. 安全性设计
- 原子性操作
- 无更改不创建空快照
- 错误静默处理

## 使用要求

### ✅ 必要条件
1. **Git 仓库已初始化**：
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```

2. **有未提交的更改**：
   - 修改文件后**不要手动提交**
   - OpenVibe 自动检测并创建快照
   - 无更改 → 不创建快照（正常）

## 常见问题

### 问题 1："No Git snapshots found"
**可能原因**：
1. Git 仓库未初始化
2. 没有未提交的更改
3. 初始提交缺失

**解决方案**：
```bash
# 1. 检查 Git 状态
git status

# 2. 检查标签
git tag -l "vibe-snapshot-*"

# 3. 查看 VS Code 控制台
# 寻找 "Git snapshot created" 或错误信息
```

### 问题 2：快照未自动创建
**原因**：所有更改都已提交（快照需要未提交的更改）

**验证步骤**：
1. 修改文件但不提交
2. 发送消息到 OpenVibe
3. 点击 "Snapshots" 按钮
4. 检查控制台日志

## 技术原理

### 快照创建流程
```
1. 用户发送消息
   ↓
2. 检查 Git 状态
   ↓
3. 有未提交更改？
   ├─ 是 → 创建提交和标签
   └─ 否 → 跳过（snapshotId: null）
   ↓
4. 记录结果到控制台
```

### 代码实现
```typescript
// 核心逻辑（src/chatView.ts）
try {
  const snapshotResult = gitSnapshotTool({
    sessionId: this._currentSessionId,
    userInstruction: text,
    description: `Auto-snapshot before processing user instruction`
  });
  // ...
} catch (error) {
  // 静默失败，不影响主流程
  console.log('Git snapshot creation skipped or failed:', error);
}
```

## 测试方法

### 测试步骤
1. **准备条件**：
   ```bash
   git init
   git add .
   git commit -m "Initial"
   ```

2. **创建测试更改**：
   - 修改 test-git.md 文件
   - **不要提交**更改

3. **触发快照**：
   - 在 OpenVibe 中发送任何消息
   - 系统自动创建快照

4. **验证结果**：
   - 点击 "Snapshots" 按钮查看列表
   - 运行 `git tag -l "vibe-snapshot-*"`
   - 检查控制台输出

### 预期结果
- 每次有未提交更改时发送消息，都会创建新快照
- 快照列表显示所有历史快照
- 可以回滚到任意快照

## 故障排除

### 快速检查清单
1. [ ] `.git` 目录存在
2. [ ] 至少有一个初始提交
3. [ ] 有未提交的更改
4. [ ] Git 状态正常
5. [ ] VS Code 控制台无错误

### 常见错误
1. **"Failed to get Git status"**：Git 仓库问题
2. **"Workspace is not a Git repository"**：需要初始化 Git
3. **静默失败**：检查控制台日志

## 最佳实践

### 推荐使用方式
1. **开始工作前**：
   - 确保 Git 初始化并有一次提交
   - 了解快照的依赖关系

2. **工作过程中**：
   - 定期修改文件
   - 通过发送消息自然创建快照
   - 不需要手动管理 Git

3. **重要节点**：
   - 在重大修改前发送消息
   - 确认快照已创建
   - 保留重要历史记录

### 注意事项
1. **不要手动提交**所有更改（留一些给 OpenVibe）
2. **定期检查**快照列表是否正常增长
3. **利用回滚**测试不同方案
4. **查看日志**了解系统运行状况

## 总结
OpenVibe 的 Git 快照功能提供了：
- 自动化的项目状态保存
- 安全的版本控制
- 便捷的回滚机制
- 与聊天流程的无缝集成

通过遵循上述指南，您可以有效利用这一功能来保护您的工作并提高开发效率。