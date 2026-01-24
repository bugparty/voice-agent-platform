# CallBuddy for Community Access

## 1. Overview

CallBuddy is an AI-assisted calling tool designed to reduce the burden of navigating automated phone systems for essential community services. The system helps users get connected, pass through IVR menus, and then hands control to the user at the moment a human agent or identity verification is required.

The core design principle is strict boundary control: AI assists with navigation and waiting, but never impersonates the user or handles protected personal or medical information.

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
* Users with call anxiety
* Caregivers assisting others

## 4. Non-Goals

CallBuddy is intentionally not designed to:

* Replace the user in conversations
* Answer identity verification questions
* Provide medical advice or prescription management
* Store or process protected health information

## 5. Key Use Case: Pharmacy Call Assistance

### Scenario

The user wants to confirm whether a prescription is ready for pickup without navigating complex automated phone menus.

### High-Level Flow

1. User selects the pharmacy call scenario
2. AI places the call and navigates IVR menus
3. If identity verification is requested, AI stops immediately
4. Control is transferred to the user
5. AI switches to silent copilot mode

## 6. System Boundaries and Safety

* AI always discloses its identity when interacting with humans
* AI never answers staff questions
* AI never provides or requests personal or medical data
* Users can take over the call at any time

## 7. Copilot Mode

Once the user takes control of the call, CallBuddy may provide:

* Real-time speech-to-text captions
* Optional translation for the user
* On-screen conversation prompts

In copilot mode, the AI never speaks into the call.

## 8. Compliance and Ethics

CallBuddy is designed to minimize legal and ethical risk by:

* Avoiding impersonation
* Avoiding storage of protected health information
* Clearly separating AI actions from user actions

## 9. Reference Voice Architecture

CallBuddy builds on a real-time voice architecture designed for low-latency, safe, and observable AI-assisted calling. The reference implementation follows a strict separation of concerns between UI control, telephony integration, and AI audio processing.

### 9.1 High-Level Architecture

* **Browser (Next.js)** acts only as a remote control and status display. It never processes raw audio.
* **Node.js media-service** is the call orchestrator. It integrates with Twilio, manages call sessions, IVR navigation, and enforces AI boundary rules.
* **Python ai-audio-service** performs audio decoding and AI inference (VAD, future ASR) via gRPC, returning only structured events.

This architecture is intentionally split to reduce blast radius and ensure that AI components cannot directly affect telephony control or user identity.

### 9.2 Audio and Event Flow

1. Twilio Media Streams deliver μ-law 8 kHz audio frames to the Node.js media-service.
2. Node.js forwards audio frames to the Python AI service over a per-session gRPC bidirectional stream.
3. The AI service performs decoding, resampling, and VAD inference, emitting structured speech events.
4. Node.js converts AI events into UI signals (for captions, copilot hints, or barge-in logic).

At no point does the AI service issue telephony commands or speak directly into the call.

### 9.3 IVR Navigation vs User Conversation

The system distinguishes two strictly separated phases:

* **IVR Navigation Phase**: AI may listen and send DTMF inputs to navigate menus.
* **User Conversation Phase**: Once identity verification or human staff is reached, AI input is disabled and control is handed to the user.

This separation is enforced at the session state-machine level.

### 9.4 Copilot Mode

After user takeover, CallBuddy may enable copilot features:

* Real-time speech-to-text captions
* Optional translation for the user
* On-screen conversation guidance

In copilot mode, the AI is display-only and cannot inject audio into the call.

## 10. Future Extensions

* Support for other essential services (utilities, housing, social services)
* Configurable IVR navigation rules
* Accessibility enhancements

## 10. Summary

CallBuddy improves access to essential services by removing the most difficult part of phone calls: getting connected. The system is designed with intentional limitations to ensure user control, privacy, and trust.
