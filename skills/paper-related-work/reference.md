# Related Work（相关工作）强约束

## 目标
不是罗列，而是“定位证明”：
- 相关方向是什么
- 代表作做到了什么
- 仍然不足在哪里
- 你补哪条缺口/交叉点

## 强制分组写法
至少 2 组，常见分法：
1) 基座模型/任务线  
2) 检索/采样线  
3) 压缩/加速线  
4) 稀疏/动态线（可选）

每组固定结构：
1) 1–2 句总结该方向  
2) 点 2–4 个代表作  
3) **限制句（必须）**：可用英文模板 “However, … remains … / These methods still suffer from …”（便于直接粘贴到论文里）
4) **桥接句（必须）**：可用英文模板 “Motivated by …, we …”（便于直接粘贴到论文里）

## Checklist（pass/fail）
- [ ] 分组 ≥2
- [ ] 每组都有 limitation sentence
- [ ] 末尾明确 closest work vs ours（差异点 1–2 句）

## 输出字段（给 Skill 做结构化生成/验收）
- groups_count（分组数量）
- has_limitation_sentence_per_group（每组是否有 limitation）
- has_bridge_sentence_per_group（每组是否有 bridge）
- has_closest_work_vs_ours（末尾是否存在 closest-vs-ours 段落）
- differences_count（末尾差异点条数，建议 1–2）

