# PrintForge

Dark-mode 3D printing studio, in-browser mesh modifier and marketplace, wired to a **local ComfyUI** so
text prompts turn into real printable meshes on your own GPU.

```
browser (Vite, :5173) ──HTTP/WS──> server/bridge.py (:8000) ──HTTP/WS──> ComfyUI (:8188)
```

Pipeline in `server/workflow_api.json` (all nodes are built into ComfyUI ≥ 0.3x, no custom nodes needed):

1. **SDXL** renders a reference image of the prompt (single object, white background)
2. **BiRefNet** removes the background, subject is composited onto white
3. **Hunyuan3D-2** turns the image into a 3D shape (voxels → surface-net mesh)
4. **SaveGLB** writes `ComfyUI/output/printforge/<prompt>_<FILAMENT>_<infill>pct_00001_.glb`

The studio loads the GLB, scales it to 80 mm and drops it on the bed; **Export .STL** gives a slicer-ready file.
The bridge can also serve STL directly: `GET /download/<file>.glb?subfolder=printforge&format=stl&size_mm=80`.

## Dependency checklist

| Need | Version | Check |
| --- | --- | --- |
| Node.js | 20.19+ (tested 24) | `node -v` |
| Python | 3.10+ (tested 3.14) | `py -3 --version` |
| ComfyUI | Comfy Desktop / portable, listening on `127.0.0.1:8188` | open http://127.0.0.1:8188 |
| NVIDIA GPU | 8 GB VRAM works (RTX 3060 Ti); ComfyUI offloads SDXL before Hunyuan3D | `nvidia-smi` |

Models ComfyUI must have (paths relative to the ComfyUI folder):

| File | Folder | Size | Source |
| --- | --- | --- | --- |
| `sd_xl_base_1.0.safetensors` | `models/checkpoints` | 6.9 GB | stabilityai/stable-diffusion-xl-base-1.0 |
| `hunyuan3d-dit-v2_fp16.safetensors` | `models/checkpoints` | 4.6 GB | [Comfy-Org/hunyuan3D_2.0_repackaged](https://huggingface.co/Comfy-Org/hunyuan3D_2.0_repackaged/resolve/main/split_files/hunyuan3d-dit-v2_fp16.safetensors) |
| `birefnet.safetensors` | `models/background_removal` | 424 MB | [Comfy-Org/BiRefNet](https://huggingface.co/Comfy-Org/BiRefNet/resolve/main/background_removal/birefnet.safetensors) |

`GET http://127.0.0.1:8000/health` (or **Ping** in the studio) lists anything the workflow needs that ComfyUI doesn't have.

## Run it

Double-click **`Start PrintForge.cmd`** (or `npm start`). It:

1. starts ComfyUI if it isn't running (paths at the top of `scripts/start-printforge.ps1`),
2. rebuilds the web app if any source file changed,
3. starts the bridge, or restarts it if `server/bridge.py` changed,
4. opens **http://127.0.0.1:8000** as an app window. The bridge serves the built app itself, so no dev server is needed.

Everything already running is reused, so it is safe to run again at any time. AI Studio re-checks the bridge
every 10 s and switches between the simulator and real generation on its own. The first job is slow while
models load from disk.

### Development

```powershell
npm install              # web dependencies
npm run bridge:setup     # one time: creates server\.venv
npm run bridge           # terminal 1 -> http://127.0.0.1:8000
npm run dev              # terminal 2 -> http://localhost:5173 (hot reload)
```

Checks: `npm run lint` (strict TypeScript), `npm run build` (typecheck + production build),
`npm run lint:bridge` (ruff; install with `server\.venv\Scripts\python -m pip install -r server/requirements-dev.txt`).

## Bridge API (`server/bridge.py`)

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | bridge + ComfyUI status, missing models / nodes |
| `POST /generate` | `{prompt, seed?, infill?, filament?, layer_height?, slicingParams?}` → `{prompt_id}` |
| `GET /status/{prompt_id}` | `queued / diffusing / meshing / exporting / completed / failed`, progress %, step, it/s, GPU VRAM/temp, `mesh_url`, `stl_url`, `preview_url` |
| `GET /download/{filename}` | streams a ComfyUI output file (`?format=stl` converts GLB → Z-up STL in mm) |
| `WS /ws` | send `{"action":"subscribe","prompt_id":"..."}` for live progress; add `"raw": true` for ComfyUI's native events |

Environment: `COMFYUI_URL`, `PF_BRIDGE_HOST`, `PF_BRIDGE_PORT`, `PF_WORKFLOW`, `PF_EXTRA_ORIGINS`.

Any other `GET` path serves the built web app from `dist/`.

CORS allows `localhost` / `127.0.0.1` on ports 5173, 4173, 3000 and the bridge port, plus ngrok, Cloudflare
quick-tunnel and localtunnel origins. The bridge binds to 127.0.0.1 only.

### Customising the workflow

Build a graph in ComfyUI, use **Export (API)**, save it as `server/workflow_api.json`, and give nodes these titles
so the bridge knows where to inject values (the file is re-read on every job):

- `PF_PROMPT`: CLIPTextEncode; `{{prompt}}` in its text is replaced by the user prompt
- `PF_NEGATIVE`: optional negative prompt
- `PF_IMAGE_SAMPLER`, `PF_MESH_SAMPLER`: samplers that receive the seed and drive progress stages
- `PF_SAVE_MESH`: SaveGLB; filename prefix gets prompt/filament/infill
- `PF_SAVE_PREVIEW`: optional SaveImage for the reference render
