const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

function createAudioAiClient({ protoPath, address }) {
  const packageDefinition = protoLoader.loadSync(protoPath, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  });
  const proto = grpc.loadPackageDefinition(packageDefinition).audioai;
  return new proto.AudioAI(address, grpc.credentials.createInsecure());
}

module.exports = {
  createAudioAiClient
};
