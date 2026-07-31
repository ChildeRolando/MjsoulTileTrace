# CV 重做 — 手牌和河牌视觉模型修正

## 已完成 (2026-07-31)

### 手牌检测：从固定 13 槽改为动态一维模型

- `Vision/Hand/HandRectifier.cs` — 透视变换将四家手牌归一化为水平条带
- `Vision/Hand/HandLatticeEstimator.cs` — 基于前景/背景对比的 1D 牌列拟合
- `Vision/Hand/DynamicDrawEstimator.cs` — 摸牌位置 = 手牌末端 + 间隙（动态，非固定坐标）
- `Vision/Hand/HandMotionSourceDetector.cs` — 帧差法检测动作来源（摸切/手切）

### 河牌检测：从轮廓+MinAreaRect 改为固定逻辑格

- `Vision/River/RiverSlotLayout.cs` — 3×6 固定逻辑格，保留原始四边形
- `Vision/River/RiverRectifier.cs` — 单元格透视归一化
- `Vision/River/RiverBackgroundModel.cs` — 每格背景建模 + EMA 更新
- `Vision/River/RiverSlotClassifier.cs` — 基于特征的格分类（背景差、边缘密度、亮度、Sobel 方向比）

### 运动门控

- `Vision/Motion/StabilityGate.cs` — ROI + 逐格帧差运动检测，时序稳定性计数器

### 集成

- `Vision/Detection/OpenCvSeatDetector.cs` — 组合 Hand + River + Motion，稳定性签名含 18-bit 河牌占位

### 测试

- 388 通过，0 失败（Core 208 / Vision 113 / Windows 67）

## 待办

- [ ] 用真实录像 (雀魂测试1.mp4) 运行 replay 验证事件产出
- [ ] 生成标注输出逐帧审核
- [ ] 调整参数（背景差阈值、前景检测阈值等）
- [ ] 副露检测仍然使用旧轮廓方案，可能需要单独改进
