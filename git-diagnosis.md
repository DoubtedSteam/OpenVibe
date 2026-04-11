# OpenVibe Git 功能诊断

## 问题描述
点击"Snapshots"按钮显示"No Git snapshots found"

## 可能的原因

### 1. Git 仓库状态
- ✅ 已确认：.git 目录存在，仓库已初始化
- ❓ 检查：是否有未提交的更改
- ❓ 检查：是否有至少一个提交记录

### 2. 快照创建逻辑
根据代码分析，Git 快照创建的流程是：
1. 用户发送消息时触发自动快照创建
2. 检查是否有未提交的更改
3. **如果没有更改，则不创建快照（snapshotId为null）**
4. 如果有更改，创建提交和标签

### 3. 关键代码分析
```typescript
// src/tools.ts 第876-883行
const hasChanges = statusResult.stdout.trim().length > 0;
if (!hasChanges) {
  return JSON.stringify({
    success: true,
    message: 'No changes to snapshot',
    snapshotId: null  // ← 关键：没有快照ID
  });
}
```

## 诊断步骤

### 步骤1：检查当前状态
```bash
# 1. 检查Git状态
git status

# 2. 检查是否有提交记录
git log --oneline

# 3. 检查是否有vibe-snapshot标签
git tag -l "vibe-snapshot-*"
```

### 步骤2：创建测试条件
```bash
# 1. 确保有未提交的更改
echo "Test change for Git snapshot" >> test-file.txt

# 2. 检查状态
git status

# 3. 发送消息测试快照
# 在OpenVibe中发送任何消息
```

### 步骤3：验证快照创建
```bash
# 1. 检查标签是否创建
git tag -l "vibe-snapshot-*"

# 2. 检查提交历史
git log --oneline --decorate

# 3. 检查VS Code控制台输出
# 查看是否有 "Git snapshot created" 日志
```

## 解决方案

### 情况A：没有未提交的更改
**问题**：Git快照需要未提交的更改才能创建
**解决**：
1. 修改文件创建更改
2. 不要手动提交
3. 发送消息让OpenVibe自动创建快照

### 情况B：Git状态异常
**问题**：Git仓库可能处于异常状态
**解决**：
1. 确保`.git`目录存在
2. 确保有初始提交：`git commit -m "Initial"`

### 情况C：代码逻辑问题
**问题**：快照创建可能静默失败
**解决**：
1. 查看VS Code输出控制台
2. 检查是否有错误信息
3. 确认`executeGitCommand`能正常工作

## 预期结果

如果一切正常：
1. 修改文件（不提交）
2. 发送消息
3. 自动创建快照（有标签）
4. "Snapshots"按钮显示快照列表

如果仍然显示"No Git snapshots found"：
1. 检查VS Code控制台日志
2. 检查Git标签是否存在
3. 可能需要手动调试代码