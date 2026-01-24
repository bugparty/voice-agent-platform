const REQUIRED_VARS = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM_NUMBER",
  "FIXED_TO_NUMBER",
  "PUBLIC_BASE_URL"
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
    fixedToNumber: getEnv("FIXED_TO_NUMBER"),
    mediaWsPath: process.env.MEDIA_WS_PATH || "/media",
    eventsPath: process.env.EVENTS_PATH || "/events",
    usePythonVad: process.env.USE_PYTHON_VAD !== "false",
    aiAudioGrpcUrl: process.env.AI_AUDIO_GRPC_URL || "localhost:50051",
    audioaiProtoPath: process.env.AUDIOAI_PROTO_PATH
  };
}

module.exports = {
  REQUIRED_VARS,
  getConfig
};
