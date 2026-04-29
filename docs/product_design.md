# CallBuddy for Community Access

## 1. Product Overview

CallBuddy is an AI-assisted calling tool designed to reduce the burden of navigating automated phone systems for essential community services. The system helps users get connected, pass through IVR menus, and then hands control to the user at the moment a human agent or identity verification is required.

**Core Design Principle**: Strict boundary control. AI assists with navigation and waiting, but never impersonates the user or handles protected personal or medical information.

## 2. Problem Statement

Many people struggle to access essential services by phone due to:

* Long IVR menus and wait times
* Language barriers
* Anxiety around phone calls
* Mobility or accessibility limitations

This friction disproportionately affects seniors, non-native English speakers, and underserved communities.

## 3. Target Users

* Seniors managing prescriptions
* Non-native English speakers
* Users with phone-call anxiety
* Caregivers assisting others

## 4. Non-Goals

CallBuddy is explicitly **not** designed to:

* Replace the user in a live conversation
* Answer identity-verification questions
* Provide medical advice or prescription management
* Store or process protected health information

## 5. Core Use Case: Pharmacy Call Assistance

### 5.1 Scenario Description

The user wants to confirm whether a prescription is ready for pickup, but does not want to navigate a complex automated phone menu.

### 5.2 User Flow

1. **Start the call**: The user selects the pharmacy call scenario.
2. **AI navigation**: AI places the call and automatically navigates the IVR menu.
3. **Critical-point detection**: When the system requests identity verification, AI immediately stops.
4. **Control handoff**: Call control is transferred to the user.
5. **Enter copilot mode**: AI switches to silent copilot mode and only provides supporting information.

### 5.3 System Behavior Boundaries

During the IVR navigation phase:
* AI may listen to voice prompts.
* AI may send DTMF signals to navigate menus.
* AI may wait in queue.

During the user conversation phase:
* AI **immediately stops** all voice interaction.
* AI **cannot** answer any questions.
* AI **cannot** provide personal information.
* The user can take over the call at any time.

## 6. Copilot Mode

After the user takes over the call, CallBuddy enters copilot mode and provides the following assistive features:

* **Real-time speech-to-text**: Converts call audio into on-screen captions.
* **Optional translation**: Provides real-time translation for the user.
* **Conversation prompts**: Displays suggested responses and guidance on screen.

**Important limitation**: In copilot mode, AI **never** injects audio into the call and only provides visual assistance.

## 7. Safety and Compliance

### 7.1 Identity Disclosure

* AI **always** discloses that it is an AI when interacting with humans.
* AI **never** impersonates the user.

### 7.2 Data Protection

* AI **never** answers staff questions.
* AI **never** provides or requests personal or medical data.
* The system **avoids** storing protected health information.

### 7.3 User Control

* The user can take over the call **at any time**.
* AI actions and user actions are **strictly separated**.
* The system is designed to ensure the user always retains final control.

### 7.4 Legal and Ethical Considerations

CallBuddy minimizes legal and ethical risk by:

* Avoiding impersonation
* Avoiding storage of protected health information
* Clearly separating AI actions from user actions

## 8. Technical Architecture Reference

> **Note**: This section provides implementation reference. For detailed architecture, see `docs/call-arch.md` and `docs/audio-pipeline.md`.

CallBuddy is built on a real-time voice architecture designed for low-latency, secure, and observable AI-assisted calls. The implementation follows a strict separation-of-concerns principle.

### 8.1 High-Level Architecture

The system is split into three independent components:

* **Browser (Next.js)**: Used only for remote control and status display; it does not process raw audio.
* **Node.js media-service**: The call orchestrator that integrates Twilio, manages call sessions, handles IVR navigation, and enforces AI boundary rules.
* **Python ai-audio-service**: Performs audio decoding and AI inference (VAD and future ASR) via gRPC, and returns only structured events.

This architecture intentionally separates responsibilities to reduce blast radius and ensure the AI component cannot directly control phone actions or user identity.

### 8.2 Audio and Event Flow

1. Twilio Media Streams sends μ-law 8 kHz audio frames to the Node.js media-service.
2. Node.js forwards audio frames to the Python AI service over a per-session bidirectional gRPC stream.
3. The AI service performs decoding, resampling, and VAD inference, then emits structured speech events.
4. Node.js transforms AI events into UI signals (for captions, copilot prompts, or interruption logic).

**Key constraint**: The AI service **never** emits phone-control commands or speaks directly into the call.

### 8.3 Phase Separation

The system distinguishes two strictly separated phases:

* **IVR navigation phase**: AI may listen and send DTMF input to navigate menus.
* **User conversation phase**: Once identity verification or a live agent is reached, AI input is disabled and control is handed to the user.

This separation is enforced at the session state-machine level.

## 9. Future Extensions

* Support additional essential-service categories (utilities, housing, social services)
* Configurable IVR navigation rules
* Enhanced accessibility features

## 10. Summary

CallBuddy improves access to essential services by removing the hardest part of phone calls: getting through to the right point in the system. It is designed with clear constraints to ensure user control, privacy, and trust. The core value is simple: AI assists with navigation, while the user controls the conversation.
