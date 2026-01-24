# CallBuddy for Community Access

## 1. 产品概述 (Overview)

### English

CallBuddy is an AI-assisted calling tool designed to reduce the burden of navigating automated phone systems for essential community services. The system helps users get connected, pass through IVR menus, and then hands control to the user at the moment a human agent or identity verification is required.

**Core Design Principle**: Strict boundary control. AI assists with navigation and waiting, but never impersonates the user or handles protected personal or medical information.

### 中文

CallBuddy 是一个 AI 辅助通话工具，旨在减轻用户在访问社区基础服务时导航自动化电话系统的负担。系统帮助用户接通电话、通过 IVR 菜单，并在需要人工客服或身份验证时立即将控制权交还给用户。

**核心设计原则**：严格的边界控制。AI 只协助导航和等待，绝不冒充用户或处理受保护的个人或医疗信息。

## 2. 问题陈述 (Problem Statement)

### English

Many people struggle to access essential services by phone due to:

* Long IVR menus and wait times
* Language barriers
* Anxiety around phone calls
* Mobility or accessibility limitations

This friction disproportionately affects seniors, non-native English speakers, and underserved communities.

### 中文

许多人在通过电话访问基础服务时遇到困难，原因包括：

* 冗长的 IVR 菜单和等待时间
* 语言障碍
* 电话通话焦虑
* 行动或无障碍限制

这些问题对老年人、非英语母语者和服务不足的社区影响尤为严重。

## 3. 目标用户 (Target Users)

* 管理处方的老年人
* 非英语母语者
* 有通话焦虑的用户
* 协助他人的护理人员

## 4. 非目标 (Non-Goals)

CallBuddy 明确**不**设计用于：

* 在对话中替代用户
* 回答身份验证问题
* 提供医疗建议或处方管理
* 存储或处理受保护的健康信息

## 5. 核心使用场景：药房电话协助

### 5.1 场景描述

用户希望确认处方是否已准备好取药，但不想导航复杂的自动化电话菜单。

### 5.2 用户流程

1. **发起通话**：用户选择药房通话场景
2. **AI 导航**：AI 拨打电话并自动导航 IVR 菜单
3. **检测关键节点**：当系统请求身份验证时，AI 立即停止
4. **控制权转移**：将通话控制权转交给用户
5. **进入副驾驶模式**：AI 切换到静默副驾驶模式，仅提供辅助信息

### 5.3 系统行为边界

在 IVR 导航阶段：
* AI 可以监听语音提示
* AI 可以发送 DTMF 信号导航菜单
* AI 可以等待队列

在用户对话阶段：
* AI **立即停止**所有语音交互
* AI **不能**回答任何问题
* AI **不能**提供个人信息
* 用户随时可以接管通话

## 6. 副驾驶模式 (Copilot Mode)

当用户接管通话后，CallBuddy 进入副驾驶模式，提供以下辅助功能：

* **实时语音转文字**：将通话内容转换为文字字幕显示
* **可选翻译**：为用户提供实时翻译
* **对话提示**：在屏幕上显示对话建议和提示

**重要限制**：在副驾驶模式下，AI **绝不**向通话中注入任何音频，仅为用户提供视觉辅助。

## 7. 系统安全与合规 (Safety and Compliance)

### 7.1 身份披露

* AI 在与人类交互时**始终**披露其 AI 身份
* AI **绝不**冒充用户

### 7.2 数据保护

* AI **绝不**回答工作人员的问题
* AI **绝不**提供或请求个人或医疗数据
* 系统**避免**存储受保护的健康信息

### 7.3 用户控制

* 用户**随时**可以接管通话
* AI 操作和用户操作**严格分离**
* 系统设计确保用户始终拥有最终控制权

### 7.4 法律与伦理

CallBuddy 通过以下方式最小化法律和伦理风险：

* 避免冒充行为
* 避免存储受保护的健康信息
* 清晰区分 AI 操作和用户操作

## 8. 技术架构参考 (Technical Architecture Reference)

> **注意**：本节提供技术实现参考，详细架构文档请参阅 `docs/call-arch.md` 和 `docs/audio-pipeline.md`。

CallBuddy 基于实时语音架构，设计用于低延迟、安全且可观察的 AI 辅助通话。实现遵循严格的关注点分离原则。

### 8.1 高层架构

系统分为三个独立组件：

* **浏览器 (Next.js)**：仅作为远程控制和状态显示，不处理原始音频
* **Node.js media-service**：通话编排器，集成 Twilio，管理通话会话、IVR 导航，并强制执行 AI 边界规则
* **Python ai-audio-service**：通过 gRPC 执行音频解码和 AI 推理（VAD、未来 ASR），仅返回结构化事件

这种架构设计有意分离，以减少影响范围，确保 AI 组件无法直接影响电话控制或用户身份。

### 8.2 音频和事件流

1. Twilio Media Streams 将 μ-law 8 kHz 音频帧发送到 Node.js media-service
2. Node.js 通过每个会话的 gRPC 双向流将音频帧转发到 Python AI 服务
3. AI 服务执行解码、重采样和 VAD 推理，发出结构化语音事件
4. Node.js 将 AI 事件转换为 UI 信号（用于字幕、副驾驶提示或打断逻辑）

**关键约束**：AI 服务**绝不**发出电话命令或直接向通话中说话。

### 8.3 阶段分离

系统区分两个严格分离的阶段：

* **IVR 导航阶段**：AI 可以监听并发送 DTMF 输入以导航菜单
* **用户对话阶段**：一旦到达身份验证或人工客服，AI 输入被禁用，控制权交给用户

这种分离在会话状态机级别强制执行。

## 9. 未来扩展 (Future Extensions)

* 支持其他基础服务（公用事业、住房、社会服务）
* 可配置的 IVR 导航规则
* 无障碍功能增强

## 10. 总结 (Summary)

CallBuddy 通过消除电话通话中最困难的部分——接通电话，来改善对基础服务的访问。系统设计具有明确的限制，以确保用户控制、隐私和信任。核心价值在于：AI 协助导航，用户掌控对话。
