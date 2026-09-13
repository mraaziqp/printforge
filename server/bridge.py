"""PrintForge local relay bridge.

Sits between the PrintForge web app and a local ComfyUI instance:

    browser --HTTP/WS--> bridge (127.0.0.1:8000) --HTTP/WS--> ComfyUI (127.0.0.1:8188)

Endpoints
    GET  /health               bridge + ComfyUI status, plus models/nodes the workflow needs but ComfyUI lacks
    POST /generate             inject prompt / seed / print settings into workflow_api.json and queue it
    GET  /status/{prompt_id}   job state: queued | diffusing | meshing | exporting | completed | failed
    GET  /download/{filename}  stream a ComfyUI output file; ?format=stl converts a GLB into a print-ready STL
    WS   /ws                   live progress for subscribed jobs (send {"action": "subscribe", "prompt_id": ...};
                               add "raw": true to also receive ComfyUI's native events verbatim)

Environment
    COMFYUI_URL       default http://127.0.0.1:8188
    PF_BRIDGE_HOST    default 127.0.0.1
    PF_BRIDGE_PORT    default 8000
    PF_WORKFLOW       default server/workflow_api.json (re-read on every job, so edits apply without a restart)
    PF_EXTRA_ORIGINS  comma-separated extra browser origins allowed to call the bridge
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import os
import re
import secrets
import shutil
import struct
import subprocess
import time
import uuid
from collections import OrderedDict
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlencode

import httpx
import numpy as np
from fastapi import FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from pydantic import BaseModel, Field
from starlette.background import BackgroundTask
from websockets.asyncio.client import connect as ws_connect

VERSION = "1.0.0"
COMFYUI_URL = os.environ.get("COMFYUI_URL", "http://127.0.0.1:8188").rstrip("/")
COMFYUI_WS_URL = re.sub(r"^http", "ws", COMFYUI_URL, count=1) + "/ws"
BRIDGE_HOST = os.environ.get("PF_BRIDGE_HOST", "127.0.0.1")
BRIDGE_PORT = int(os.environ.get("PF_BRIDGE_PORT", "8000"))
WORKFLOW_PATH = Path(os.environ.get("PF_WORKFLOW") or Path(__file__).with_name("workflow_api.json"))
# Built web app (npm run build); when present the bridge serves it, so the whole stack is ComfyUI + this process
DIST_DIR = Path(os.environ.get("PF_DIST") or Path(__file__).resolve().parent.parent / "dist")
# ComfyUI only sends progress events to the websocket whose clientId submitted the prompt,
# so every job is queued under this id and a single upstream socket listens for all of them.
CLIENT_ID = f"printforge-bridge-{uuid.uuid4().hex[:12]}"
MAX_TRACKED_JOBS = 200
PROMPT_ID_RE = re.compile(r"[A-Za-z0-9_-]{1,64}")

ALLOWED_ORIGINS = [f"http://{host}:{port}" for host in ("localhost", "127.0.0.1") for port in (5173, 4173, 3000, BRIDGE_PORT)] + [
    origin.strip() for origin in os.environ.get("PF_EXTRA_ORIGINS", "").split(",") if origin.strip()
]
# Public tunnels (ngrok, Cloudflare quick tunnels, localtunnel) fronting the Vite dev server
TUNNEL_ORIGIN_REGEX = r"https://[a-z0-9-]+(\.[a-z0-9-]+)*\.(ngrok-free\.app|ngrok\.app|ngrok\.io|trycloudflare\.com|loca\.lt)"

log = logging.getLogger("printforge.bridge")

# stage -> (status reported to the app, progress window in %, human label)
STAGES: dict[str, tuple[str, tuple[float, float], str]] = {
    "queued": ("queued", (0, 4), "Waiting in ComfyUI queue"),
    "diffusing": ("diffusing", (4, 45), "Rendering reference image (SDXL)"),
    "background": ("diffusing", (45, 50), "Removing background (BiRefNet)"),
    "meshing": ("meshing", (50, 85), "Sampling 3D shape (Hunyuan3D-2)"),
    "exporting": ("exporting", (85, 99), "Decoding voxels and writing GLB mesh"),
    "completed": ("completed", (100, 100), "Mesh ready"),
    "failed": ("failed", (0, 0), "Generation failed"),
}
STAGE_ORDER = ["queued", "diffusing", "background", "meshing", "exporting", "completed"]
TERMINAL = {"completed", "failed"}
# Only nodes that do real work move the stage; loaders and constants can execute in any order.
STAGE_BY_CLASS = {
    "VAEDecode": "diffusing",
    "RemoveBackground": "background",
    "ImageCompositeMasked": "background",
    "CLIPVisionEncode": "meshing",
    "Hunyuan3Dv2Conditioning": "meshing",
    "VAEDecodeHunyuan3D": "exporting",
    "VoxelToMesh": "exporting",
    "VoxelToMeshBasic": "exporting",
    "SaveGLB": "exporting",
}
STAGE_BY_TITLE = {"PF_IMAGE_SAMPLER": "diffusing", "PF_MESH_SAMPLER": "meshing"}
LABEL_BY_TITLE = {"PF_IMAGE_SAMPLER": "SDXL KSampler", "PF_MESH_SAMPLER": "Hunyuan3D-2 KSampler"}
# Stage names the PrintForge frontend already understands
APP_STAGE = {
    "queued": "queued",
    "diffusing": "diffusion",
    "background": "diffusion",
    "meshing": "meshing",
    "exporting": "meshing",
    "completed": "completed",
    "failed": "error",
}
MESH_EXTENSIONS = (".glb", ".gltf", ".stl", ".obj", ".ply")
MEDIA_TYPES = {
    "glb": "model/gltf-binary",
    "gltf": "model/gltf+json",
    "stl": "model/stl",
    "obj": "text/plain",
    "ply": "application/octet-stream",
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "webp": "image/webp",
}
SAFE_FILENAME = re.compile(r"[\w\-. ()]{1,200}")
SAFE_SUBFOLDER = re.compile(r"[\w\-. /]{0,200}")


# --------------------------------------------------------------------------------------------
# Job tracking
# --------------------------------------------------------------------------------------------


@dataclass
class Job:
    prompt_id: str
    meta: dict[str, Any]
    node_stage: dict[str, str]
    node_label: dict[str, str]
    created: float = field(default_factory=time.time)
    stage: str = "queued"
    progress: float = 0.0
    node: str | None = None
    step: int | None = None
    total_steps: int | None = None
    it_rate: float | None = None
    error: str | None = None
    mesh: dict[str, str] | None = None
    preview: dict[str, str] | None = None
    started: float | None = None
    finished: float | None = None
    _rate_mark: tuple[float, int] | None = None

    @property
    def status(self) -> str:
        return STAGES[self.stage][0]

    def enter_stage(self, stage: str) -> None:
        if self.stage in TERMINAL or stage not in STAGE_ORDER:
            return
        # Cached or preview nodes can run late; never move backwards.
        if STAGE_ORDER.index(stage) > STAGE_ORDER.index(self.stage):
            self.stage = stage
        self.progress = max(self.progress, STAGES[self.stage][1][0])

    def enter_node(self, node: str) -> None:
        self.node = node
        self.step = self.total_steps = None
        self.it_rate = None
        self._rate_mark = None
        if node in self.node_stage:
            self.enter_stage(self.node_stage[node])

    def record_step(self, value: int, maximum: int) -> None:
        now = time.monotonic()
        if self._rate_mark and value > self._rate_mark[1]:
            elapsed = now - self._rate_mark[0]
            if elapsed > 0:
                rate = (value - self._rate_mark[1]) / elapsed
                self.it_rate = rate if self.it_rate is None else 0.7 * self.it_rate + 0.3 * rate
        self._rate_mark = (now, value)
        self.step, self.total_steps = value, maximum
        low, high = STAGES[self.stage][1]
        if maximum > 0:
            self.progress = max(self.progress, low + (high - low) * min(value / maximum, 1.0))

    def finish(self, error: str | None = None) -> None:
        if self.stage in TERMINAL:
            return
        self.finished = time.time()
        if error:
            self.stage, self.error = "failed", error
        else:
            self.stage, self.progress = "completed", 100.0


class Subscriber:
    def __init__(self, websocket: WebSocket):
        self.ws = websocket
        self.prompt_ids: set[str] = set()
        self.raw = False
        self.base_url = http_base_url(str(websocket.base_url))
        self._lock = asyncio.Lock()

    def wants(self, prompt_id: str | None) -> bool:
        return not self.prompt_ids or prompt_id in self.prompt_ids

    async def send(self, payload: dict[str, Any]) -> bool:
        try:
            async with self._lock:
                await asyncio.wait_for(self.ws.send_json(payload), timeout=5)
            return True
        except Exception:
            return False


class GpuMonitor:
    """Real VRAM / temperature readings via nvidia-smi, cached for two seconds."""

    def __init__(self) -> None:
        self._exe = shutil.which("nvidia-smi")
        self._value: dict[str, Any] = {}
        self._at = 0.0

    async def snapshot(self) -> dict[str, Any]:
        if not self._exe:
            return {}
        if time.monotonic() - self._at < 2.0:
            return self._value
        self._at = time.monotonic()
        try:
            self._value = await asyncio.to_thread(self._query)
        except Exception:
            self._value = {}
        return self._value

    def _query(self) -> dict[str, Any]:
        result = subprocess.run(  # noqa: S603 - fixed argv: resolved nvidia-smi path and constant flags
            [
                self._exe,
                "--query-gpu=name,memory.used,memory.total,temperature.gpu,utilization.gpu",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            text=True,
            timeout=3,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        name, used, total, temp, util = [part.strip() for part in result.stdout.strip().splitlines()[0].split(",")]
        return {
            "worker_device": name,
            "vram_used_mb": int(float(used)),
            "vram_total_mb": int(float(total)),
            "gpu_temp_c": int(float(temp)),
            "gpu_util_pct": int(float(util)),
        }


class BridgeState:
    def __init__(self) -> None:
        self.http: httpx.AsyncClient | None = None
        self.jobs: OrderedDict[str, Job] = OrderedDict()
        self.subscribers: set[Subscriber] = set()
        self.upstream_connected = False
        self.gpu = GpuMonitor()


state = BridgeState()


def comfy() -> httpx.AsyncClient:
    if state.http is None:
        raise HTTPException(503, "Bridge is still starting up")
    return state.http


def track_job(job: Job) -> None:
    state.jobs[job.prompt_id] = job
    while len(state.jobs) > MAX_TRACKED_JOBS:
        victim = next((pid for pid, j in state.jobs.items() if j.stage in TERMINAL), next(iter(state.jobs)))
        state.jobs.pop(victim)


def http_base_url(url: str) -> str:
    url = url.rstrip("/")
    if url.startswith("ws://"):
        return "http://" + url[5:]
    if url.startswith("wss://"):
        return "https://" + url[6:]
    return url


def origin_allowed(origin: str) -> bool:
    return origin in ALLOWED_ORIGINS or re.fullmatch(TUNNEL_ORIGIN_REGEX, origin) is not None


def safe_json(response: httpx.Response) -> dict[str, Any]:
    try:
        data = response.json()
    except ValueError:
        return {}
    return data if isinstance(data, dict) else {}


def file_ref(item: dict[str, Any]) -> dict[str, str]:
    return {
        "filename": str(item.get("filename", "")),
        "subfolder": str(item.get("subfolder", "")),
        "type": str(item.get("type", "output")),
    }


def file_url(base_url: str, ref: dict[str, str], **extra: str) -> str:
    query = urlencode({"subfolder": ref.get("subfolder", ""), "type": ref.get("type", "output"), **extra})
    return f"{base_url}/download/{quote(ref['filename'])}?{query}"


def record_outputs(job: Job, output: dict[str, Any]) -> None:
    for item in output.get("3d") or []:
        if str(item.get("filename", "")).lower().endswith(MESH_EXTENSIONS):
            job.mesh = file_ref(item)
    for item in output.get("images") or []:
        if item.get("type") == "output":
            job.preview = file_ref(item)


def history_error(status: dict[str, Any]) -> str:
    for message in status.get("messages") or []:
        if not isinstance(message, list) or len(message) < 2:
            continue
        name, data = message[0], message[1] or {}
        if name == "execution_error":
            return f"{data.get('node_type', 'ComfyUI')}: {str(data.get('exception_message', 'execution error')).strip()}"
        if name == "execution_interrupted":
            return "Generation was interrupted in ComfyUI"
    return "ComfyUI reported an execution error"


async def sync_from_history(job: Job) -> bool:
    """Settle a job from ComfyUI's /history. Returns False if the prompt has not finished yet."""
    try:
        entry = safe_json(await comfy().get(f"/history/{job.prompt_id}")).get(job.prompt_id)
    except httpx.HTTPError:
        return False
    if not entry:
        return False
    for output in (entry.get("outputs") or {}).values():
        record_outputs(job, output or {})
    status = entry.get("status") or {}
    if status.get("status_str") == "error":
        job.finish(error=history_error(status))
    elif job.mesh:
        job.finish()
    else:
        job.finish(error="Workflow finished without writing a 3D mesh (check the SaveGLB node titled PF_SAVE_MESH)")
    return True


async def finalize(job: Job) -> None:
    if job.stage in TERMINAL:
        return
    if job.mesh:
        job.finish()
        return
    # execution_success is emitted slightly before ComfyUI writes the history entry
    for _ in range(10):
        if await sync_from_history(job):
            return
        await asyncio.sleep(0.5)
    job.finish(error="ComfyUI finished but no 3D mesh output was reported")


async def job_payload(job: Job, base_url: str) -> dict[str, Any]:
    eta = None
    if job.it_rate and job.step is not None and job.total_steps:
        eta = max(0, round((job.total_steps - job.step) / job.it_rate))
    end = job.finished or time.time()
    is_glb = bool(job.mesh and job.mesh["filename"].lower().endswith(".glb"))
    return {
        "prompt_id": job.prompt_id,
        "status": job.status,
        "stage": job.stage,
        "stage_name": job.error if job.stage == "failed" and job.error else STAGES[job.stage][2],
        "progress_pct": round(job.progress, 1),
        "node": job.node,
        "node_label": job.node_label.get(job.node) if job.node else None,
        "step": job.step,
        "total_steps": job.total_steps,
        "iteration_rate": round(job.it_rate, 2) if job.it_rate else None,
        "eta_seconds": eta,
        "elapsed_seconds": round(end - (job.started or job.created), 1),
        "mesh_url": file_url(base_url, job.mesh) if job.mesh else None,
        "mesh_filename": job.mesh["filename"] if job.mesh else None,
        "stl_url": file_url(base_url, job.mesh, format="stl") if job.mesh and is_glb else None,
        "preview_url": file_url(base_url, job.preview) if job.preview else None,
        "error": job.error,
        "meta": job.meta,
        "hardware_metrics": {} if job.stage in TERMINAL else await state.gpu.snapshot(),
    }


async def ws_payload(job: Job, base_url: str) -> dict[str, Any]:
    payload = await job_payload(job, base_url)
    hardware = payload["hardware_metrics"]
    message = {
        "type": {"completed": "complete", "failed": "error"}.get(job.stage, "progress"),
        "promptId": job.prompt_id,
        "status": payload["status"],
        "stage": APP_STAGE[job.stage],
        "statusText": payload["stage_name"],
        "percentage": payload["progress_pct"],
        "progressPercent": payload["progress_pct"],
        "step": payload["step"],
        "totalSteps": payload["total_steps"],
        "samplerName": payload["node_label"],
        "iterationRate": payload["iteration_rate"],
        "etaSeconds": payload["eta_seconds"],
        "vramUsedMb": hardware.get("vram_used_mb"),
        "gpuTempC": hardware.get("gpu_temp_c"),
        "meshUrl": payload["mesh_url"],
        "stlUrl": payload["stl_url"],
        "previewUrl": payload["preview_url"],
        "error": payload["error"],
        "connectionType": "websocket",
    }
    return {key: value for key, value in message.items() if value is not None}


async def broadcast_job(job: Job) -> None:
    payloads: dict[str, dict[str, Any]] = {}
    for sub in [s for s in state.subscribers if s.wants(job.prompt_id)]:
        if sub.base_url not in payloads:
            payloads[sub.base_url] = await ws_payload(job, sub.base_url)
        if not await sub.send(payloads[sub.base_url]):
            state.subscribers.discard(sub)


async def relay_raw(event: dict[str, Any], prompt_id: str | None) -> None:
    for sub in [s for s in state.subscribers if s.raw and (prompt_id is None or s.wants(prompt_id))]:
        if not await sub.send({"type": "comfy", "event": event}):
            state.subscribers.discard(sub)


async def handle_comfy_event(event: dict[str, Any]) -> None:
    event_type = event.get("type")
    data = event.get("data") or {}
    prompt_id = data.get("prompt_id")
    await relay_raw(event, prompt_id)

    job = state.jobs.get(prompt_id) if prompt_id else None
    if job is None or job.stage in TERMINAL:
        return

    if event_type == "execution_start":
        job.started = job.started or time.time()
        job.enter_stage("diffusing")
    elif event_type == "executing":
        if data.get("node") is None:
            await finalize(job)
        else:
            job.enter_node(str(data["node"]))
    elif event_type == "progress":
        node = str(data.get("node")) if data.get("node") is not None else None
        if node and node != job.node:
            job.enter_node(node)
        job.record_step(int(data.get("value", 0)), int(data.get("max", 0)))
    elif event_type == "executed":
        record_outputs(job, data.get("output") or {})
    elif event_type == "execution_success":
        await finalize(job)
    elif event_type == "execution_error":
        node_type = data.get("node_type", "ComfyUI")
        job.finish(error=f"{node_type}: {str(data.get('exception_message', 'execution error')).strip()}")
    elif event_type == "execution_interrupted":
        job.finish(error="Generation was interrupted in ComfyUI")
    else:
        return
    await broadcast_job(job)


async def comfy_ws_loop() -> None:
    backoff = 1.0
    while True:
        try:
            async with ws_connect(
                f"{COMFYUI_WS_URL}?clientId={CLIENT_ID}", max_size=None, open_timeout=5, ping_interval=20
            ) as upstream:
                state.upstream_connected = True
                backoff = 1.0
                log.info("Connected to ComfyUI websocket at %s", COMFYUI_WS_URL)
                async for message in upstream:
                    if isinstance(message, bytes):
                        continue  # latent preview frames
                    try:
                        event = json.loads(message)
                    except ValueError:
                        continue
                    if isinstance(event, dict):
                        await handle_comfy_event(event)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            if state.upstream_connected:
                log.warning("Lost ComfyUI websocket: %s", exc)
        if state.upstream_connected is False and backoff == 1.0:
            log.info("Waiting for ComfyUI at %s ...", COMFYUI_URL)
        state.upstream_connected = False
        await asyncio.sleep(backoff)
        backoff = min(backoff * 2, 15.0)


# --------------------------------------------------------------------------------------------
# Workflow handling
# --------------------------------------------------------------------------------------------


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=1500)
    negative_prompt: str | None = Field(default=None, max_length=1500)
    seed: int | None = Field(default=None, ge=0, le=2**63 - 1)
    infill: int | None = Field(default=None, ge=0, le=100)
    filament: str | None = Field(default=None, max_length=16)
    layer_height: float | None = Field(default=None, gt=0, le=1)
    slicingParams: dict[str, Any] | None = None
    geometryType: str | None = Field(default=None, max_length=32)

    def resolved_infill(self) -> int:
        value = self.infill if self.infill is not None else (self.slicingParams or {}).get("infill", 20)
        try:
            return max(0, min(100, int(value)))
        except (TypeError, ValueError):
            return 20

    def resolved_filament(self) -> str:
        raw = self.filament or (self.slicingParams or {}).get("filament") or "PLA"
        return re.sub(r"[^A-Za-z0-9]", "", str(raw)).upper()[:16] or "PLA"


def load_workflow() -> dict[str, Any]:
    try:
        graph = json.loads(WORKFLOW_PATH.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise HTTPException(500, f"Workflow template not found: {WORKFLOW_PATH}") from None
    except json.JSONDecodeError as exc:
        raise HTTPException(500, f"{WORKFLOW_PATH.name} is not valid JSON: {exc}") from exc
    if not isinstance(graph, dict) or not all(isinstance(n, dict) and "class_type" in n for n in graph.values()):
        raise HTTPException(500, f"{WORKFLOW_PATH.name} must be a ComfyUI API-format graph (Export (API) in ComfyUI)")
    return graph


def nodes_titled(graph: dict[str, Any], title: str) -> list[dict[str, Any]]:
    return [node for node in graph.values() if node.get("_meta", {}).get("title") == title]


def slugify(text: str, limit: int = 40) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug[:limit].strip("-") or "model"


def build_prompt_graph(req: GenerateRequest) -> tuple[dict[str, Any], dict[str, Any]]:
    graph = load_workflow()
    prompt = req.prompt.strip()
    filament = req.resolved_filament()
    infill = req.resolved_infill()
    seed = req.seed if req.seed is not None else secrets.randbelow(2**32)

    positive = nodes_titled(graph, "PF_PROMPT")
    if not positive:
        raise HTTPException(500, f"{WORKFLOW_PATH.name} needs a CLIPTextEncode node titled PF_PROMPT")
    for node in positive:
        template = str(node["inputs"].get("text") or "{{prompt}}")
        node["inputs"]["text"] = template.replace("{{prompt}}", prompt) if "{{prompt}}" in template else f"{prompt}, {template}"
    if req.negative_prompt:
        for node in nodes_titled(graph, "PF_NEGATIVE"):
            node["inputs"]["text"] = ", ".join(filter(None, [node["inputs"].get("text"), req.negative_prompt]))
    for title in ("PF_IMAGE_SAMPLER", "PF_MESH_SAMPLER"):
        for node in nodes_titled(graph, title):
            key = "noise_seed" if "noise_seed" in node["inputs"] else "seed"
            node["inputs"][key] = seed

    # Infill and filament don't change the generated geometry; they travel with the file name
    # and the GLB metadata so the exported mesh stays tied to the print profile it was made for.
    prefix = f"printforge/{slugify(prompt)}_{filament}_{infill}pct"
    for node in nodes_titled(graph, "PF_SAVE_MESH"):
        node["inputs"]["filename_prefix"] = prefix
    for node in nodes_titled(graph, "PF_SAVE_PREVIEW"):
        node["inputs"]["filename_prefix"] = f"{prefix}_ref"

    meta = {
        "prompt": prompt,
        "seed": seed,
        "filament": filament,
        "infill_pct": infill,
        "layer_height_mm": req.layer_height,
        "geometry_type": req.geometryType,
    }
    return graph, meta


def classify_nodes(graph: dict[str, Any]) -> tuple[dict[str, str], dict[str, str]]:
    stages, labels = {}, {}
    for node_id, node in graph.items():
        title = node.get("_meta", {}).get("title", "")
        stage = STAGE_BY_TITLE.get(title) or STAGE_BY_CLASS.get(node["class_type"])
        if stage:
            stages[node_id] = stage
        labels[node_id] = LABEL_BY_TITLE.get(title) or (title if title and not title.startswith("PF_") else node["class_type"])
    return stages, labels


def comfy_error_message(body: dict[str, Any], status_code: int) -> str:
    error = body.get("error")
    if isinstance(error, dict):
        message = str(error.get("message") or "ComfyUI rejected the workflow")
        details = str(error.get("details") or "").strip()
        return f"{message}: {details}" if details else message
    return f"ComfyUI rejected the workflow (HTTP {status_code})"


def node_error_lines(body: dict[str, Any]) -> list[str]:
    lines = []
    for node_id, node_error in (body.get("node_errors") or {}).items():
        for error in node_error.get("errors") or []:
            details = str(error.get("details") or "").strip()
            line = f"{node_error.get('class_type', '?')} #{node_id}: {error.get('message', 'invalid input')}"
            lines.append(f"{line} ({details})" if details else line)
    return lines


def combo_options(spec: Any) -> list[Any] | None:
    if not isinstance(spec, list) or not spec:
        return None
    if isinstance(spec[0], list):
        return spec[0]
    if spec[0] == "COMBO" and len(spec) > 1 and isinstance(spec[1], dict) and isinstance(spec[1].get("options"), list):
        return spec[1]["options"]
    return None


async def check_workflow_against_comfy() -> tuple[list[str], list[str]]:
    """Find node types ComfyUI doesn't have and dropdown values (model files) it doesn't list."""
    graph = load_workflow()
    missing_values: list[str] = []
    missing_nodes: list[str] = []
    info_by_class: dict[str, Any] = {}
    for node in graph.values():
        class_type = node["class_type"]
        if class_type not in info_by_class:
            info_by_class[class_type] = safe_json(await comfy().get(f"/object_info/{quote(class_type)}")).get(class_type)
        info = info_by_class[class_type]
        if not info:
            if class_type not in missing_nodes:
                missing_nodes.append(class_type)
            continue
        inputs = info.get("input") or {}
        specs = {**(inputs.get("required") or {}), **(inputs.get("optional") or {})}
        for name, value in (node.get("inputs") or {}).items():
            options = combo_options(specs.get(name)) if isinstance(value, str) else None
            if options is not None and value not in options:
                entry = f"{value} ({class_type}.{name})"
                if entry not in missing_values:
                    missing_values.append(entry)
    return missing_values, missing_nodes


# --------------------------------------------------------------------------------------------
# GLB -> STL
# --------------------------------------------------------------------------------------------


def glb_to_stl(data: bytes, size_mm: float | None) -> bytes:
    """Convert a GLB (Y-up, arbitrary units) into a binary STL that is Z-up, scaled so its largest
    side is size_mm, centred on X/Y and resting on Z=0 - ready to drop into a slicer."""
    if len(data) < 20 or data[:4] != b"glTF":
        raise ValueError("file is not a binary glTF (.glb)")
    end = min(struct.unpack_from("<I", data, 8)[0], len(data))
    offset, gltf, bin_chunk = 12, None, b""
    while offset + 8 <= end:
        length, chunk_type = struct.unpack_from("<II", data, offset)
        chunk = data[offset + 8 : offset + 8 + length]
        offset += 8 + length
        if chunk_type == 0x4E4F534A:
            gltf = json.loads(chunk)
        elif chunk_type == 0x004E4942:
            bin_chunk = chunk
    if gltf is None:
        raise ValueError("GLB has no JSON chunk")

    accessors, views = gltf.get("accessors", []), gltf.get("bufferViews", [])
    component_dtypes = {5126: "<f4", 5125: "<u4", 5123: "<u2", 5121: "u1"}
    type_widths = {"SCALAR": 1, "VEC3": 3}

    def read_accessor(index: int) -> np.ndarray:
        accessor = accessors[index]
        view = views[accessor["bufferView"]]
        dtype = np.dtype(component_dtypes[accessor["componentType"]])
        width = type_widths[accessor["type"]]
        stride = view.get("byteStride") or dtype.itemsize * width
        start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
        return np.array(
            np.ndarray((accessor["count"], width), dtype=dtype, buffer=bin_chunk, offset=start, strides=(stride, dtype.itemsize))
        )

    vertex_sets, face_sets, base = [], [], 0
    for mesh in gltf.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            attributes = primitive.get("attributes", {})
            if primitive.get("mode", 4) != 4 or "POSITION" not in attributes:
                continue
            positions = read_accessor(attributes["POSITION"]).astype(np.float64)
            indices = read_accessor(primitive["indices"]).reshape(-1) if "indices" in primitive else np.arange(len(positions))
            faces = indices[: len(indices) // 3 * 3].astype(np.int64).reshape(-1, 3) + base
            vertex_sets.append(positions)
            face_sets.append(faces)
            base += len(positions)
    if not face_sets:
        raise ValueError("GLB contains no triangle meshes")

    vertices = np.concatenate(vertex_sets)
    faces = np.concatenate(face_sets)
    # glTF is Y-up, slicers are Z-up: (x, y, z) -> (x, -z, y) is a rotation, so winding is preserved.
    vertices = np.stack([vertices[:, 0], -vertices[:, 2], vertices[:, 1]], axis=1)
    extent = vertices.max(axis=0) - vertices.min(axis=0)
    if size_mm and extent.max() > 0:
        vertices *= size_mm / extent.max()
    low, high = vertices.min(axis=0), vertices.max(axis=0)
    vertices -= np.array([(low[0] + high[0]) / 2, (low[1] + high[1]) / 2, low[2]])

    triangles = vertices[faces]
    normals = np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0])
    lengths = np.linalg.norm(normals, axis=1, keepdims=True)
    normals = np.divide(normals, lengths, out=np.zeros_like(normals), where=lengths > 0)

    records = np.zeros(len(faces), dtype=np.dtype([("normal", "<f4", (3,)), ("vertices", "<f4", (3, 3)), ("attr", "<u2")]))
    records["normal"] = normals
    records["vertices"] = triangles
    header = b"PrintForge binary STL (mm, Z-up)".ljust(80, b"\0")
    return header + struct.pack("<I", len(faces)) + records.tobytes()


# --------------------------------------------------------------------------------------------
# App
# --------------------------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(_: FastAPI):
    state.http = httpx.AsyncClient(base_url=COMFYUI_URL, timeout=httpx.Timeout(30.0, connect=3.0))
    listener = asyncio.create_task(comfy_ws_loop(), name="comfyui-websocket")
    log.info("PrintForge bridge %s -> ComfyUI %s (workflow: %s)", VERSION, COMFYUI_URL, WORKFLOW_PATH)
    try:
        yield
    finally:
        listener.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await listener
        await state.http.aclose()


app = FastAPI(title="PrintForge Bridge", version=VERSION, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=TUNNEL_ORIGIN_REGEX,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "Content-Length"],
    max_age=600,
)


@app.middleware("http")
async def private_network_access(request: Request, call_next):
    # Chrome asks before a public (tunnelled) page may call a localhost service.
    response = await call_next(request)
    if request.headers.get("access-control-request-private-network") == "true":
        response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response


@app.get("/health")
async def health() -> dict[str, Any]:
    comfy_info: dict[str, Any] = {"url": COMFYUI_URL, "reachable": False}
    missing_models: list[str] = []
    missing_nodes: list[str] = []
    workflow_error = None
    try:
        stats = safe_json(await comfy().get("/system_stats", timeout=3))
        to_mb = lambda value: int(value / 1048576) if isinstance(value, (int, float)) else None  # noqa: E731
        comfy_info.update(
            reachable=True,
            version=(stats.get("system") or {}).get("comfyui_version"),
            devices=[
                {"name": d.get("name"), "vram_total_mb": to_mb(d.get("vram_total")), "vram_free_mb": to_mb(d.get("vram_free"))}
                for d in stats.get("devices") or []
            ],
        )
    except httpx.HTTPError:
        pass
    if comfy_info["reachable"]:
        try:
            missing_models, missing_nodes = await check_workflow_against_comfy()
        except HTTPException as exc:
            workflow_error = str(exc.detail)
        except httpx.HTTPError as exc:
            workflow_error = f"Could not query ComfyUI node info: {exc}"
    return {
        "service": "printforge-bridge",
        "version": VERSION,
        "ok": comfy_info["reachable"] and not missing_models and not missing_nodes and workflow_error is None,
        "comfyui": comfy_info,
        "upstream_ws_connected": state.upstream_connected,
        "workflow": WORKFLOW_PATH.name,
        "workflow_error": workflow_error,
        "models_checked": comfy_info["reachable"],
        "missing_models": missing_models,
        "missing_nodes": missing_nodes,
        "active_jobs": sum(1 for job in state.jobs.values() if job.stage not in TERMINAL),
    }


@app.post("/generate")
async def generate(req: GenerateRequest) -> dict[str, Any]:
    if not req.prompt.strip():
        raise HTTPException(422, "Prompt must not be empty")
    graph, meta = build_prompt_graph(req)
    payload = {"prompt": graph, "client_id": CLIENT_ID, "extra_data": {"extra_pnginfo": {"printforge": meta}}}
    try:
        response = await comfy().post("/prompt", json=payload)
    except httpx.HTTPError as exc:
        raise HTTPException(
            503, f"ComfyUI is not reachable at {COMFYUI_URL} ({exc.__class__.__name__}). Start ComfyUI first."
        ) from exc
    body = safe_json(response)
    if response.status_code != 200:
        raise HTTPException(
            422 if response.status_code == 400 else 502,
            detail={"message": comfy_error_message(body, response.status_code), "errors": node_error_lines(body)},
        )
    prompt_id = body.get("prompt_id")
    if not isinstance(prompt_id, str):
        raise HTTPException(502, "ComfyUI accepted the workflow but returned no prompt_id")

    stages, labels = classify_nodes(graph)
    track_job(Job(prompt_id=prompt_id, meta=meta, node_stage=stages, node_label=labels))
    log.info(
        "Queued %s seed=%s %s %s%% infill: %s",
        prompt_id,
        meta["seed"],
        meta["filament"],
        meta["infill_pct"],
        meta["prompt"][:80],
    )
    return {"prompt_id": prompt_id, "status": "queued", "queue_number": body.get("number"), "seed": meta["seed"]}


@app.get("/status/{prompt_id}")
async def status(prompt_id: str, request: Request) -> dict[str, Any]:
    if not PROMPT_ID_RE.fullmatch(prompt_id):
        raise HTTPException(400, "Invalid prompt_id")
    job = state.jobs.get(prompt_id)
    if job is None or job.stage not in TERMINAL:
        # History is the source of truth for finished prompts (covers missed websocket events and bridge restarts)
        probe = job or Job(prompt_id=prompt_id, meta={}, node_stage={}, node_label={})
        if await sync_from_history(probe):
            job = probe
            track_job(job)
        elif job is None:
            try:
                queue = safe_json(await comfy().get("/queue"))
            except httpx.HTTPError as exc:
                raise HTTPException(503, f"ComfyUI is not reachable at {COMFYUI_URL}") from exc
            running = {item[1] for item in queue.get("queue_running") or [] if isinstance(item, list) and len(item) > 1}
            pending = {item[1] for item in queue.get("queue_pending") or [] if isinstance(item, list) and len(item) > 1}
            if prompt_id not in running | pending:
                raise HTTPException(404, "Unknown prompt_id")
            if prompt_id in running:
                probe.enter_stage("diffusing")
            job = probe
            track_job(job)
    return await job_payload(job, str(request.base_url).rstrip("/"))


@app.get("/download/{filename}")
async def download(
    filename: str,
    subfolder: str = "",
    type: str = Query("output", pattern="^(output|temp)$"),
    format: str | None = Query(None, pattern="^(stl)$"),
    size_mm: float = Query(80.0, gt=1, le=1000),
):
    if (
        not SAFE_FILENAME.fullmatch(filename)
        or filename.startswith(".")
        or not SAFE_SUBFOLDER.fullmatch(subfolder)
        or ".." in subfolder
        or subfolder.startswith("/")
    ):
        raise HTTPException(400, "Invalid file name")
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if extension not in MEDIA_TYPES:
        raise HTTPException(400, f"Unsupported file type: .{extension}")
    params = {"filename": filename, "subfolder": subfolder, "type": type}

    if format == "stl" and extension == "glb":
        try:
            upstream = await comfy().get("/view", params=params, timeout=120)
        except httpx.HTTPError as exc:
            raise HTTPException(503, f"ComfyUI is not reachable: {exc}") from exc
        if upstream.status_code != 200:
            raise HTTPException(404 if upstream.status_code == 404 else 502, "File not found in ComfyUI output")
        try:
            stl = await asyncio.to_thread(glb_to_stl, upstream.content, size_mm)
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise HTTPException(422, f"Could not convert GLB to STL: {exc}") from exc
        stl_name = filename[: -len(".glb")] + ".stl"
        return Response(stl, media_type="model/stl", headers={"Content-Disposition": f'attachment; filename="{stl_name}"'})

    try:
        upstream = await comfy().send(comfy().build_request("GET", "/view", params=params), stream=True)
    except httpx.HTTPError as exc:
        raise HTTPException(503, f"ComfyUI is not reachable: {exc}") from exc
    if upstream.status_code != 200:
        await upstream.aclose()
        raise HTTPException(404 if upstream.status_code == 404 else 502, "File not found in ComfyUI output")
    disposition = "inline" if MEDIA_TYPES[extension].startswith("image/") else "attachment"
    headers = {"Content-Disposition": f'{disposition}; filename="{filename}"'}
    if "content-length" in upstream.headers:
        headers["Content-Length"] = upstream.headers["content-length"]
    return StreamingResponse(
        upstream.aiter_bytes(), media_type=MEDIA_TYPES[extension], headers=headers, background=BackgroundTask(upstream.aclose)
    )


@app.websocket("/ws")
async def telemetry_socket(websocket: WebSocket) -> None:
    origin = websocket.headers.get("origin")
    if origin and not origin_allowed(origin):
        await websocket.close(code=1008)
        return
    await websocket.accept()
    sub = Subscriber(websocket)
    state.subscribers.add(sub)
    await sub.send({"type": "status", "statusText": "PrintForge bridge connected", "comfyuiConnected": state.upstream_connected})
    try:
        while True:
            try:
                message = json.loads(await websocket.receive_text())
            except ValueError:
                continue
            if not isinstance(message, dict):
                continue
            action = message.get("action")
            if action == "subscribe":
                if "raw" in message:
                    sub.raw = bool(message["raw"])
                prompt_id = message.get("prompt_id")
                if isinstance(prompt_id, str) and PROMPT_ID_RE.fullmatch(prompt_id):
                    sub.prompt_ids.add(prompt_id)
                    if prompt_id in state.jobs:
                        await sub.send(await ws_payload(state.jobs[prompt_id], sub.base_url))
            elif action == "unsubscribe":
                sub.prompt_ids.discard(str(message.get("prompt_id")))
            elif action == "ping":
                await sub.send({"type": "status", "statusText": "pong", "comfyuiConnected": state.upstream_connected})
    except (WebSocketDisconnect, RuntimeError, KeyError):
        pass
    finally:
        state.subscribers.discard(sub)


# Registered last so every API route above takes precedence.
@app.get("/{path:path}", include_in_schema=False)
async def web_app(path: str) -> Response:
    """Serve the built PrintForge web app so opening http://127.0.0.1:8000 is all a user needs."""
    target = await asyncio.to_thread(resolve_web_file, path)
    if target is None:
        if path == "" and not (DIST_DIR / "index.html").exists():
            return JSONResponse(await health())
        raise HTTPException(404, "Not found (run npm run build if the web app is missing)")
    cache = "public, max-age=31536000, immutable" if target.parent.name == "assets" else "no-cache"
    return FileResponse(target, headers={"Cache-Control": cache})


def resolve_web_file(path: str) -> Path | None:
    root = DIST_DIR.resolve()
    index = root / "index.html"
    if not index.is_file():
        return None
    target = (root / path).resolve() if path else index
    if target.is_relative_to(root) and target.is_file():
        return target
    # Unknown extension-less paths fall back to the single-page app; missing files stay 404
    return None if "." in path.rsplit("/", 1)[-1] else index


if __name__ == "__main__":
    import uvicorn

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(name)s: %(message)s")
    uvicorn.run(app, host=BRIDGE_HOST, port=BRIDGE_PORT, log_level="info")
