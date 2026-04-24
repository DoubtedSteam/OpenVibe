# Method（含 Preliminary）强约束（可执行）

## A. 开场 4 要素（必须在前 10–15 行出现）
- 输入：写清 \({V,Q}\)/\({I,T}\)/\({x,y}\) 分别是什么
- 输出：写清输出对象类型（集合/序列/特征/子网络）
- 预算：frame/token/skip/latency/memory 至少一个
- 目标：一句话写清最大化/最小化什么（可用公式）

## B. 公式链条硬规则（必须显式点出联系）
任何连续公式都必须满足：
1) 新公式前必须有 **过渡句** 指出与上式关系：
   -（英文模板，可直接粘贴论文）Based on Eq. (k), we define …
   -（英文模板，可直接粘贴论文）To optimize Eq. (k), we introduce …
   -（英文模板，可直接粘贴论文）Plugging … into Eq. (k), we obtain …
   -（英文模板，可直接粘贴论文）To make Eq. (k) tractable, we approximate/relax …
2) 变量继承一致：新符号出现必须当句定义
3) 目标一致：从概率→损失/奖励切换必须解释等价/替代/近似原因
4) 约束一致：所有选择/采样必须围绕同一预算 \(K/B\)

## C. 每个小节最低可复现标准（建议全覆盖）
- 一句话目标（本节解决什么）
- 输入/输出（模块吃什么吐什么）
- 关键步骤（Step A/B/C）
- 选择准则（Top‑K/threshold/sampling/DP/ranking）
- 超参（含含义 + 默认值/设置规则）
- 成本说明（主要耗时来自哪里，避免了什么）

## D. 段间桥接句（必须）
两段之间必须回答：
- 上一段得到了什么（定义/目标/分布）
- 下一段要做什么（求解/实现/加速）

## E. Method 段末收束（必须）
2–4 句完成：
- pipeline 总结（输入→模块→输出）
- 部署性质（training‑free/plug‑and‑play/no extra model/超参少）
- 指向实验验证点（有效性/效率/敏感性）

## Checklist（pass/fail）
- [ ] 开场 4 要素齐全
- [ ] 公式之间全部有显式过渡句
- [ ] 无未定义符号
- [ ] 每个关键模块有 IO + 选择准则 + 步骤
- [ ] Method 段末收束存在

## 验收字段（给 Skill 做结构化生成/验收）
- has_opening_4_tuple（输入/输出/预算/目标是否齐全）
- undefined_symbol_count（未定义符号数量，必须为 0）
- equation_count（公式数量）
- equation_transition_count（显式过渡句数量）
- eq_transition_coverage = equation_transition_count / max(equation_count-1,1)（覆盖率，越高越好）
- budget_consistency_ok（预算符号/含义是否一致）

## equation_links[]（强制生成“显式过渡句”的结构）
对每个公式跳转生成一条：
- from_eq: k
- to_eq: k+1
- relation_phrase: “Based on / To optimize / Plugging into / Rewrite / Approximate …”

