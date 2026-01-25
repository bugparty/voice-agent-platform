"""Proto files for gRPC communication."""

# grpcio-tools generates absolute imports like `import agent_pb2` inside
# `agent_pb2_grpc.py`. When these modules live under this package, that import
# fails unless we expose a top-level alias. This keeps generated files untouched.
import sys

try:
    from . import agent_pb2 as _agent_pb2
except Exception:  # pragma: no cover - import only if generated exists
    _agent_pb2 = None
else:
    sys.modules.setdefault("agent_pb2", _agent_pb2)
