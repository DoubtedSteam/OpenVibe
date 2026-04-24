# Experiment（实验）强约束套路（可执行）

## 0) 实验章节标准骨架（必须有，缺一则补）
> 说明：这是章节级“宏观结构”；下面的“三句套路”是段落级“微观结构”。两者都必须满足。

1) **Implementation Details**：模型/embedding/训练轮次/学习率/budget/硬件  
2) **Benchmarks & Metrics**：数据集一句话 + 指标定义  
3) **Main results（Quantitative）**：vs baseline vs SOTA（表）  
4) **Efficiency**：时间拆解（load/encode/retrieve/infer）、显存、吞吐（表/图）  
5) **Ablation**：去模块、超参敏感性、budget 曲线（frames/tokens/K）  
6) **Qualitative**：用可视化支撑主张（coherence/coverage/noise robustness/等）

> **与语料对齐（`paper_revisions_unzipped`）**：下列 **8 篇**老师修改稿（当前解压目录下的全部子文件夹）均属对齐范围；6 块信息**须在全章或紧密衔接的图表中覆盖**，但**小节标题、顺序、是否拆成多节**允许按venue/模板变化。验收以「块是否齐全 + 段落级观察→证据→收束」为准，**不要求**与某一两篇的 LaTeX 标题字面一致。

### 0.1 全量语料清单（目录名 = 解压子文件夹）
1. `OneClip_CVPR2026` — `sec/4_experiment.tex` + `tabs/*.tex`  
2. `OneClip_IJCV` — `sec/4_experiment.tex` + `sn-article.tex` 主文件编排  
3. `WeFlow-main`（AdaQ）— `sec/4_experiments.tex` + `table/*.tex`  
4. `ForestPrune_camera_ready` — `sec/4_experiments.tex`  
5. `DyVTE_NeurIPS25___Arxiv_` — `neurips_2025.tex` 内 `\section{Experiment}`（单文件）  
6. `NeurIPS23_DAS` — `competitions_neurips_2022.tex` 内 `\section{Experiment}`  
7. `Routing_Experts__Learning_to_Route_Dynamic_Experts_in_Multi_modal_Large_Language_Models__ICLR_` — `iclr2025_conference.tex` 内 `\section{Experiment}`  
8. `Not_All_Attention_is_Needed__Parameter_and_Computation_Efficient_Tuning_for_Multi_modal_Large_Language_Models_via_Effective_Attention_Skipping__pre_` — `sn-article.tex` 内 `\section{Experiment}`  

（若日后往 `paper_revisions_unzipped` 增解压新稿，**默认并入**同一套对齐规则。）

### 0.2 版式变体（skill 不得判错）
- **源码组织**：既有 `main.tex` + `sec/*.tex`，也有 **单文件长稿**（NeurIPS/ICLR/SN 模板）；抽取时按 `\section{Experiment}` / `\section{Experiments}` 定位即可。  
- **小节命名**：`Datasets and Metrics` / `Benchmarks and Metrics` / `Datasets and Experimental Setup` / `Experimental Settings` 等均视为「数据集与指标」块。  
- **顺序**：允许 **Datasets → 主表 → Implementation**（如 DyVTE 主表紧跟指标段、Implementation 在后）；允许 **Benchmarks+Implementation 合并**（如 WeFlow）；允许 **先 `\input` 表再写分析**（OneClip_IJCV 等）。  
- **效率**：允许**无单独 `Efficiency` 小节**，只要主结果表中并列 **效果 + TFLOPs / tokens/s / time** 等与语料一致（DyVTE、RoE 等）；有独立效率图/表则更好（OneClip、ForestPrune）。  
- **定性**：允许以 **Figure + 段首 `In Fig.~...`** 为主（ForestPrune / RoE）；与独立 `Qualitative Analysis` 小节等价。

## 1) 开场第一句话（必须）
### 1.1 中文稿（老师原话模板）
模板：我们用 **{模型/设置}** 在 **{数据集/任务}** 上进行了 **{实验类型}** 实验，结果见 **{表/图} X**。  
要求：只交代实验，不写结论、不写数字。

### 1.2 英文稿（与上述**全部**语料等价）
以下**任选一种**即视为满足「开场句」（须含：**对比主体（方法/设置）+ 数据或任务范围 + 表或图引用**；仍不写具体数值结论）：

- **小标题 + 首句指表**：`\noindent\textbf{Effects of \texttt{METHOD} on ...}` + `We first examine ... with results presented in Tab.~\ref{...}.`
- **Conduct on + 指表**：`We conduct extensive experiments on {benchmarks} ... including ...`（后文紧跟主表 `Tab.~\ref{...}` 或 `\input{tables/...}`）
- **Compare in + 指表**：`We first compare {METHOD} to ... in Tab.~\ref{...}.`
- **Results in Table + 首句指表**（DyVTE / RoE / EAS 常见）：`In Table.~\ref{...}, we first present ...` / `In Tab.~\ref{...}, we first compare ...`

## 2) 两句循环套路（必须重复若干次）
每个结论点写：
1. 抽象观察句（禁止数字）：我们可以观察到的现象是 **{趋势/相对关系}**。
2. 具体证据句（必须数字+指向表/图）：具体而言/例如，从 **{表/图} X** 可见 baseline 为 **{数字}**，我们的方法为 **{数字}**（同预算/同设置）。
可选第三句强调：更重要的是，在更难设置/更小预算下仍保持该现象，表明 **{机制}**。

> **与语料对齐**：英文稿里常写作连续自然段，例如 `From Tab.~\ref{...}, we can observe that ...`（观察）紧跟 `For instance, ... 14.0\% ...`（证据）。**不要求**机械插入中文套话「我们可以观察到的现象是」；只要**相邻语义**先抽象趋势、后数字证据，即视为同一套路。

## 3) 段末收束句（必须，In summary 为可选形式之一）
以下**任选一句**作为段末收束即可（须**同义改写**呼应贡献点，**不引入新数字**）：

- `In summary, ...`（中文或英文均可）
- `Overall, these results ...`（OneClip / ForestPrune / AdaQ 常见）
- `These results well confirm ...` / `Overall, these results well confirm ...`

## Checklist（pass/fail）
- [ ] 有开场句（含模型/数据集/实验类型/表图编号）
- [ ] 抽象观察句无数字
- [ ] 证据句有数字且指向表/图
- [ ] 证据句有 baseline + 对齐设置/预算
- [ ] 段末有 **收束句**（In summary / Overall / These results … 均可）且改写呼应贡献点

## 段落合规性字段（给 Skill 做自动验收）
对每个实验段落输出以下布尔/计数（建议）：
- has_opening_sentence
- observation_has_no_numbers
- evidence_has_numbers
- evidence_has_fig_or_table_id
- evidence_has_baseline_and_aligned_setting
- has_closing_sentence（段末收束：In summary / Overall / These results … 等）
- claim_units_count（观察+证据对的数量）

