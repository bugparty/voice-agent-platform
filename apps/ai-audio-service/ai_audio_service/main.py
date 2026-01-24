import importlib
import os
import sys
import time
from concurrent import futures
from pathlib import Path

import grpc


BASE_DIR = Path(__file__).resolve().parent
REPO_ROOT = BASE_DIR.parents[2]  # ai_audio_service -> ai-audio-service -> apps -> voip_agent
PROTO_DIR = BASE_DIR / "proto"
PROTO_DIR.mkdir(parents=True, exist_ok=True)
DEFAULT_PROTO_PATH = REPO_ROOT / "packages" / "proto" / "audioai.proto"
PROTO_PATH = Path(os.getenv("AUDIOAI_PROTO_PATH", str(DEFAULT_PROTO_PATH)))


def ensure_generated():
    pb2_path = PROTO_DIR / "audioai_pb2.py"
    pb2_grpc_path = PROTO_DIR / "audioai_pb2_grpc.py"
    if pb2_path.exists() and pb2_grpc_path.exists():
        return

    try:
        from grpc_tools import protoc
    except ImportError as exc:
        raise RuntimeError("grpcio-tools is required to generate protobuf files") from exc

    args = [
        "grpc_tools.protoc",
        f"-I{PROTO_PATH.parent}",
        f"--python_out={PROTO_DIR}",
        f"--grpc_python_out={PROTO_DIR}",
        str(PROTO_PATH),
    ]
    result = protoc.main(args)
    if result != 0:
        raise RuntimeError("Failed to generate protobuf files")


def load_proto():
    ensure_generated()
    sys.path.insert(0, str(PROTO_DIR))
    audioai_pb2 = importlib.import_module("audioai_pb2")
    audioai_pb2_grpc = importlib.import_module("audioai_pb2_grpc")
    return audioai_pb2, audioai_pb2_grpc


class VadMockService:
    def __init__(self, audioai_pb2):
        self.audioai_pb2 = audioai_pb2

    def Stream(self, request_iterator, context):
        speaking = False
        frame_count = 0
        last_ts = 0
        session_id = None

        for chunk in request_iterator:
            session_id = chunk.session_id or session_id
            last_ts = chunk.timestamp_ms or last_ts

            if not speaking:
                speaking = True
                yield self.audioai_pb2.VadEvent(
                    session_id=session_id or "",
                    event="SPEECH_START",
                    prob=0.8,
                    timestamp_ms=last_ts,
                )

            frame_count += 1
            if frame_count % 10 == 0:
                yield self.audioai_pb2.VadEvent(
                    session_id=session_id or "",
                    event="SPEECH_UPDATE",
                    prob=0.7,
                    timestamp_ms=last_ts,
                )

        if speaking:
            yield self.audioai_pb2.VadEvent(
                session_id=session_id or "",
                event="SPEECH_END",
                prob=0.0,
                timestamp_ms=last_ts,
            )


def serve():
    audioai_pb2, audioai_pb2_grpc = load_proto()
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=4))
    audioai_pb2_grpc.add_AudioAIServicer_to_server(VadMockService(audioai_pb2), server)

    port = os.getenv("AI_AUDIO_SERVICE_PORT", "50051")
    server.add_insecure_port(f"[::]:{port}")
    server.start()
    print(f"ai-audio-service listening on {port}")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        server.stop(0)


if __name__ == "__main__":
    serve()
