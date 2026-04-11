# OpenVibe 日志获取指南

## 🚀 快速开始

### **步骤 1：打开输出面板**
- **方法 A**：菜单栏 → View → Output
- **方法 B**：快捷键 **Ctrl+Shift+U** (Windows/Linux) 或 **Cmd+Shift+U** (Mac)
- **方法 C**：点击底部状态栏的 Output 按钮

### **步骤 2：选择输出通道**
1. 在输出面板右上角找到下拉菜单
2. 点击下拉菜单
3. 选择 **"OpenVibe"**
   ```
   ┌─────────────────────────┐
   │ 🔽 选择通道             │
   ├─────────────────────────┤
   │ Tasks                   │
   │ Extension Host          │
   │ ▶ OpenVibe              │ ← 选这个！
   │ Git                     │
   │ Terminal                │
   └─────────────────────────┘
   ```

### **步骤 3：触发日志生成**
在 OpenVibe 聊天中发送任何消息，例如：
```
测试 Git 快照功能
```

## 📊 预期的日志输出

### **正常情况（快照创建成功）**
```
[GitSnapshot] Starting for session default, instruction: "测试 Git 快照功能..."
[GitSnapshot] Workspace root: C:\Users\47549\Desktop\openvibe
[GitSnapshot] Checking Git status...
[GitSnapshot] Status result: success=true, stdout=" M test-git.md", stderr=""
Git snapshot result: success=true, snapshotId=snapshot-1742208000000-abc123, message="Created Git snapshot snapshot-1742208000000-abc123 for user instruction", error=""
```

### **有问题的日志**
```
// 情况1：没有未提交的更改
[GitSnapshot] Status result: success=true, stdout="", stderr=""
Git snapshot result: success=true, snapshotId=null, message="No changes to snapshot", error=""

// 情况2：Git命令失败
[GitSnapshot] Status result: success=false, stdout="", stderr="git is not recognized..."
Git snapshot result: success=false, snapshotId=null, message="", error="Failed to get Git status: git is not recognized..."

// 情况3：Git仓库不存在
Git snapshot creation skipped or failed: Error: Workspace is not a Git repository...
```

## 🔧 故障排除

### **问题1：看不到"OpenVibe"输出通道**
**解决方案：**
1. 发送一条消息激活扩展
2. 等待几秒钟
3. 刷新输出面板（点击输出面板右上角的刷新图标）

### **问题2：输出面板完全空白**
**解决方案：**
1. 打开VS Code开发者工具：Help → Toggle Developer Tools
2. 切换到"Console"标签页
3. 查看是否有错误信息

### **问题3：没有日志输出**
**解决方案：**
1. 检查扩展是否已激活
2. 重新加载VS Code窗口：Ctrl+R (Windows/Linux) 或 Cmd+R (Mac)
3. 确保工作区文件夹已打开

## 📱 其他日志查看方式

### **1. VS Code开发者工具**
- 打开方式：Help → Toggle Developer Tools
- 查看位置：Console标签页
- 包含：所有VS Code扩展的日志，包括错误和警告

### **2. 终端输出**
如果以调试模式运行扩展：
```bash
code --extensionDevelopmentPath=/path/to/openvibe
```

### **3. 日志文件位置**
扩展日志通常存储在：
- Windows: `%APPDATA%\Code\logs\`
- macOS: `~/Library/Application Support/Code/logs/`
- Linux: `~/.config/Code/logs/`

## 🎯 Git快照调试专用步骤

### **测试场景：诊断"No Git snapshots found"**
1. **准备状态**：
   ```bash
   # 确保有未提交的更改
   git status --porcelain
   # 应该显示类似：M test-git.md
   ```

2. **发送测试消息**：
   ```
   测试Git快照123
   ```

3. **查看日志**：
   - 关注 `[GitSnapshot] Status result` 行
   - 检查 `stdout` 是否显示文件更改
   - 检查是否有错误信息

4. **验证结果**：
   ```bash
   # 检查是否创建了标签
   git tag -l "vibe-snapshot-*"
   ```

## 📋 常见日志说明

| 日志内容 | 含义 | 操作建议 |
|---------|------|---------|
| `[GitSnapshot] Starting...` | 快照创建开始 | 正常流程 |
| `success=true, snapshotId=...` | 快照创建成功 | ✅ 一切正常 |
| `success=true, snapshotId=null` | 没有检测到更改 | 修改文件但不提交 |
| `success=false` | Git命令执行失败 | 检查Git安装和PATH |
| 没有 `[GitSnapshot]` 日志 | `gitSnapshotTool`未被调用 | 检查代码修改是否正确 |

## 🆘 紧急帮助

如果仍然看不到日志：
1. **截图当前输出面板**发给我
2. **描述具体操作步骤**
3. **提供以下信息**：
   - VS Code版本
   - 操作系统
   - 是否看到"OpenVibe"通道
   - 发送消息后发生了什么

## 💡 提示
- 日志是**实时更新**的，发送消息后立即查看
- 可以**清空日志**（输出面板右上角的清空按钮）
- 日志**不会自动保存**，关闭VS Code后消失
- 重要的日志可以**复制出来**保存