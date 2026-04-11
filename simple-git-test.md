# 最小化 Git 快照测试

## 测试目的
验证 Git 快照功能是否能在最简单的情况下工作。

## 当前状态
我们修改了代码添加了调试日志。现在您应该：

### 步骤 1：发送测试消息
在 OpenVibe 中发送一条消息，例如："测试 Git 快照"

### 步骤 2：查看控制台日志
打开 VS Code 的"输出"面板，选择"OpenVibe"输出通道，查看日志。

期望看到的日志：
```
[GitSnapshot] Starting for session default, instruction: "测试 Git 快照..."
[GitSnapshot] Workspace root: C:\Users\47549\Desktop\openvibe
[GitSnapshot] Checking Git status...
[GitSnapshot] Status result: success=..., stdout="...", stderr="..."
```

### 步骤 3：检查结果
根据日志判断：
1. 如果 `success=true` 且 `stdout` 不为空 → 应该有快照创建
2. 如果 `success=true` 但 `stdout` 为空 → 没有未提交的更改
3. 如果 `success=false` → Git 命令执行失败

## 测试文件
这个文件本身就是一个未提交的更改。

修改时间：2025-02-15T11:10:00.000Z

## 关键验证点

### 1. Git 仓库状态
```bash
# 运行这些命令验证状态
git status --porcelain
git tag -l "vibe-snapshot-*"
```

### 2. 日志分析
检查以下关键信息：
- `executeGitCommand` 是否成功
- `git status --porcelain` 的输出
- 是否有错误信息

### 3. 结果验证
成功创建快照的标志：
1. 控制台显示 "Git snapshot created"
2. 出现新的 Git 标签 `vibe-snapshot-default-*`
3. "Snapshots" 按钮显示快照列表

## 如果仍然失败

### 常见问题
1. **Git 命令权限问题**：VS Code 可能没有执行 Git 命令的权限
2. **工作区路径问题**：`getWorkspaceRoot()` 返回的路径可能不正确
3. **Git 配置问题**：Git 可能未正确配置用户信息
4. **Node.js execSync 问题**：子进程执行可能被阻止

### 手动测试 Git 命令
```bash
# 在项目根目录运行
cd "C:\Users\47549\Desktop\openvibe"
git status --porcelain
git add .
git commit -m "Test commit"
git tag -a "vibe-snapshot-test-123" -m "Test snapshot"
```

## 调试要点
1. 检查 `getWorkspaceRoot()` 返回的路径
2. 检查 `executeGitCommand` 是否实际调用 Git
3. 检查 Git 是否在系统 PATH 中
4. 检查是否有防病毒软件阻止子进程执行