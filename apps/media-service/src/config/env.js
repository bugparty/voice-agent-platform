const REQUIRED_VARS = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM_NUMBER",
  "FIXED_TO_NUMBER",
  "PUBLIC_BASE_URL"
];

const OPTIONAL_VARS = [
  "TWILIO_API_KEY",
  "TWILIO_API_SECRET",
  "TWILIO_TWIML_APP_SID"
];

function getEnv(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function getConfig() {
  return {
    port: Number(process.env.MEDIA_SERVICE_PORT || 4001),
    publicBaseUrl: getEnv("PUBLIC_BASE_URL"),
    twilioAccountSid: getEnv("TWILIO_ACCOUNT_SID"),
    twilioAuthToken: getEnv("TWILIO_AUTH_TOKEN"),
    twilioFromNumber: getEnv("TWILIO_FROM_NUMBER"),
    twilioApiKey: process.env.TWILIO_API_KEY,
    twilioApiSecret: process.env.TWILIO_API_SECRET,
    twilioTwimlAppSid: process.env.TWILIO_TWIML_APP_SID,
    fixedToNumber: getEnv("FIXED_TO_NUMBER"),
    mediaWsPath: process.env.MEDIA_WS_PATH || "/media",
    eventsPath: process.env.EVENTS_PATH || "/events",
    usePythonVad: process.env.USE_PYTHON_VAD !== "false",
    aiAudioGrpcUrl: process.env.AI_AUDIO_GRPC_URL || "localhost:50051",
    audioaiProtoPath: process.env.AUDIOAI_PROTO_PATH,
    // Deepgram ASR configuration
    deepgramApiKey: process.env.DEEPGRAM_API_KEY,
    asrEnabled: process.env.ASR_ENABLED === "true",
    asrLanguage: process.env.ASR_LANGUAGE || "en-US",
    asrModel: process.env.ASR_MODEL || "nova-2",
    // Agent gRPC server configuration
    agentGrpcPort: Number(process.env.AGENT_GRPC_PORT || 50052),
    agentProtoPath: process.env.AGENT_PROTO_PATH
  };
}

module.exports = {
  REQUIRED_VARS,
  OPTIONAL_VARS,
  getConfig
};
