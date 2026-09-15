# Local Scan Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** สร้างหน้าเว็บภาษาไทยที่รันเฉพาะในเครื่อง เพื่อเลือกโฟลเดอร์รายปีหรือรายเดือน สแกนภาพ รอ Codex เติมวันที่ อัปโหลดเฉพาะออเดอร์ที่ยังไม่มี และแสดงผลตรวจสอบ โดยคง CLI เดิมไว้

**Architecture:** ใช้ Flask bind ที่ `127.0.0.1` เป็นชั้น HTTP บาง ๆ เหนือ service ที่เรียกแกนงานเดิมจาก `scan.py`, `apply.py` และ `verify.py` หน้าเว็บใช้ HTML/CSS/JavaScript ธรรมดาและ poll สถานะงาน ไม่ส่งค่า Supabase ไป browser และอนุญาตงานเปลี่ยนสถานะครั้งละหนึ่งงาน

**Tech Stack:** Python 3, Flask 3.x, Pillow, Requests, pytest, HTML5, CSS, vanilla JavaScript

**Spec:** `docs/superpowers/specs/2026-09-15-local-scan-web-design.md`

## Global Constraints

- Server ต้อง bind เฉพาะ `127.0.0.1` และปฏิเสธ Host/Origin ที่ไม่ใช่ local
- CLI ของ `scan.py`, `apply.py` และ `verify.py` ต้องใช้ argument เดิมได้
- ห้ามส่ง `SUPABASE_KEY` หรือค่าลับจาก `js/config.js` ไป frontend หรือ log
- การอัปโหลดจากเว็บต้องใช้ `replace=False` และ `preflight=True` เสมอ
- ระบบต้องไม่เขียน เปลี่ยนชื่อ หรือลบไฟล์ในโฟลเดอร์รูปต้นทาง
- ต้องใช้ `bot/work/plan.json`, `state.json`, `crops/` และ `report.md` เดิมเพื่อให้ Codex ทำขั้นอ่านบัตรต่อได้
- ต้องไม่แก้ `index.html` หรือ flow ของเว็บออเดอร์หลัก
- งาน scan, apply และ verify รันได้ครั้งละหนึ่งงาน
- รูปเรียงเป็นบัตรด้านหลัง บัตรด้านหน้า และรูปอื่นตามลำดับเดิม

## File Map

- Modify `bot/scan.py`: แยก `run_scan()` ออกจาก CLI และส่ง progress callback
- Modify `bot/apply.py`: เพิ่ม pure preview และ `run_apply()` สำหรับ CLI/เว็บ
- Modify `bot/verify.py`: เพิ่ม `run_verify()` ที่คืน structured result
- Create `bot/web_service.py`: เลือก root, settings, status projection, job lock และ orchestration
- Create `bot/web_app.py`: Flask app, local-request guard และ API routes
- Create `bot/web/index.html`: โครงหน้า dashboard และ dialogs
- Create `bot/web/styles.css`: visual system, responsive layout และ accessibility states
- Create `bot/web/app.js`: state rendering, polling และ actions
- Create `bot/requirements.txt`: runtime/test dependencies
- Create `bot/start_web.bat`: launcher สำหรับ Windows
- Create `bot/tests/conftest.py`: import path และ shared fixtures
- Create `bot/tests/test_scan_api.py`: tests สำหรับ scan refactor
- Create `bot/tests/test_apply_api.py`: tests สำหรับ preview/apply refactor
- Create `bot/tests/test_verify_api.py`: tests สำหรับ verify refactor
- Create `bot/tests/test_web_service.py`: tests สำหรับ root/settings/status/job manager
- Create `bot/tests/test_web_app.py`: tests สำหรับ HTTP API และ local security
- Modify `.gitignore`: ignore `bot/web_settings.json`
- Modify `bot/README.md`: วิธีติดตั้ง เปิดเว็บ และ flow ร่วมกับ Codex

---

### Task 1: Make scanning callable without changing CLI behavior

**Files:**
- Modify: `bot/scan.py:300-378`
- Create: `bot/tests/conftest.py`
- Create: `bot/tests/test_scan_api.py`

**Interfaces:**
- Produces: `scan.run_scan(root: str, only: list[str] | None = None, limit: int | None = None, dry_run: bool = False, progress: Callable[[str], None] | None = None) -> dict | None`
- Produces: plan dict with existing keys `root`, `month_num`, `month_th`, `section_id`, `status`, `locked`, `scanned_at`, `folders`

- [ ] **Step 1: Add the test import fixture**

```python
# bot/tests/conftest.py
import sys
from pathlib import Path

BOT_DIR = Path(__file__).resolve().parents[1]
if str(BOT_DIR) not in sys.path:
    sys.path.insert(0, str(BOT_DIR))
```

- [ ] **Step 2: Write failing callable-scan tests**

```python
# bot/tests/test_scan_api.py
from pathlib import Path
import scan


def test_run_scan_returns_and_writes_plan(tmp_path, monkeypatch):
    month = tmp_path / "9.กันยายน"
    (month / "IRJ-2026091").mkdir(parents=True)
    monkeypatch.setattr(scan.C, "PLAN_JSON", str(tmp_path / "plan.json"))
    monkeypatch.setattr(scan.C, "REPORT_MD", str(tmp_path / "report.md"))
    monkeypatch.setattr(scan.C, "WORK_DIR", str(tmp_path / "work"))
    monkeypatch.setattr(scan.C, "CROP_DIR", str(tmp_path / "crops"))
    monkeypatch.setattr(scan, "scan_folder", lambda root, name: {
        "folder": name, "status": "ready", "image_count": 2,
        "images": ["back.png", "front.png"], "crop": "crop.png",
        "date_iso": None,
    })
    messages = []

    plan = scan.run_scan(str(month), progress=messages.append)

    assert plan["month_num"] == 9
    assert plan["month_th"] == "กันยายน"
    assert plan["folders"][0]["folder"] == "IRJ-2026091"
    assert Path(scan.C.PLAN_JSON).exists()
    assert any("IRJ-2026091" in line for line in messages)


def test_run_scan_dry_run_does_not_write(tmp_path, monkeypatch):
    month = tmp_path / "9.กันยายน"
    month.mkdir()
    monkeypatch.setattr(scan.C, "PLAN_JSON", str(tmp_path / "plan.json"))
    plan = scan.run_scan(str(month), dry_run=True)
    assert plan["root"] == str(month)
    assert not Path(scan.C.PLAN_JSON).exists()
```

- [ ] **Step 3: Run tests and verify the missing-interface failure**

Run: `python -m pytest bot/tests/test_scan_api.py -v`

Expected: FAIL with `AttributeError: module 'scan' has no attribute 'run_scan'`.

- [ ] **Step 4: Extract `run_scan()` and keep `main()` as an argument adapter**

Implement this signature and replace direct `print()` calls inside the extracted flow with `emit()`:

```python
def run_scan(root, only=None, limit=None, dry_run=False, progress=None):
    emit = progress or print
    if not os.path.isdir(root):
        raise ValueError("ไม่พบโฟลเดอร์: %s" % root)
    # Move the existing main scan body here unchanged.
    # Filter with `only`, stop at `limit`, archive the previous month,
    # write PLAN_JSON unless dry_run, then return the plan dict.
```

Make CLI errors retain their current message:

```python
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=C.ROOT)
    ap.add_argument("--only", action="append")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    try:
        run_scan(args.root, args.only, args.limit, args.dry_run)
    except ValueError as exc:
        sys.exit(str(exc))
```

- [ ] **Step 5: Run scan unit tests and CLI help**

Run: `python -m pytest bot/tests/test_scan_api.py -v`

Expected: 2 passed.

Run: `python bot/scan.py --help`

Expected: exit 0 and output contains `--root`, `--only`, `--limit`, `--dry-run`.

- [ ] **Step 6: Commit the scan refactor**

```bash
git add bot/scan.py bot/tests/conftest.py bot/tests/test_scan_api.py
git commit -m "refactor: expose scanner for local web"
```

---

### Task 2: Add upload preview and callable apply workflow

**Files:**
- Modify: `bot/apply.py:158-257`
- Create: `bot/tests/test_apply_api.py`

**Interfaces:**
- Consumes: plan/state dictionaries written by Task 1
- Produces: `apply.build_apply_preview(plan: dict, state: dict, existing: dict[str, str], replace: bool = False) -> dict`
- Produces: `apply.run_apply(limit: int | None = None, only: list[str] | None = None, replace: bool = False, redo: bool = False, dry_run: bool = False, run_preflight: bool = True, progress: Callable[[str], None] | None = None) -> dict`
- Preview keys: `ready`, `done_before`, `duplicates`, `image_count`, `month_th`

- [ ] **Step 1: Write failing pure-preview tests**

```python
# bot/tests/test_apply_api.py
import apply


def test_preview_separates_ready_done_and_duplicates():
    plan = {"month_th": "กันยายน", "folders": [
        {"folder": "IRJ-2026091", "status": "ready", "date_iso": "2026-09-01", "images": ["a.png"]},
        {"folder": "IRJ-2026092", "status": "ready", "date_iso": "2026-09-02", "images": ["b.png", "c.png"]},
        {"folder": "IRJ-2026093", "status": "no_cert", "date_iso": None, "images": []},
    ]}
    state = {"IRJ-2026091": {"status": "done"}}
    existing = {"IRJ-2026092": "ord_existing"}

    preview = apply.build_apply_preview(plan, state, existing)

    assert preview["ready"] == []
    assert preview["done_before"] == ["IRJ-2026091"]
    assert preview["duplicates"] == ["IRJ-2026092"]
    assert preview["image_count"] == 0


def test_preview_never_replaces_duplicate_by_default():
    plan = {"month_th": "กันยายน", "folders": [
        {"folder": "IRJ-2026092", "status": "ready", "date_iso": "2026-09-02", "images": ["b.png"]},
    ]}
    preview = apply.build_apply_preview(plan, {}, {"IRJ-2026092": "ord_existing"})
    assert preview["ready"] == []
```

- [ ] **Step 2: Run tests and verify failure**

Run: `python -m pytest bot/tests/test_apply_api.py -v`

Expected: FAIL because `build_apply_preview` does not exist.

- [ ] **Step 3: Implement the pure preview**

```python
def build_apply_preview(plan, state, existing, replace=False):
    candidates = [r for r in plan["folders"]
                  if r.get("status") == "ready" and r.get("date_iso")]
    done_before = [r["folder"] for r in candidates
                   if (state.get(r["folder"]) or {}).get("status") == "done"]
    candidates = [r for r in candidates if r["folder"] not in done_before]
    duplicates = [r["folder"] for r in candidates if r["folder"] in existing]
    ready = candidates if replace else [r for r in candidates if r["folder"] not in existing]
    return {
        "ready": ready,
        "done_before": done_before,
        "duplicates": duplicates,
        "image_count": sum(len(r.get("images") or []) for r in ready),
        "month_th": plan.get("month_th") or "",
    }
```

- [ ] **Step 4: Extract `run_apply()` from `main()`**

Move the existing database lookup, category resolution, preflight and worker pool into `run_apply()`. Use `progress or print` through a local emitter and return:

```python
{
    "status": "dry" if dry_run else ("complete" if not errors else "failed"),
    "done": len(ok),
    "errors": errors,
    "images": sum(item.get("images", 0) for item in ok),
    "bytes": sum(item.get("bytes", 0) for item in ok),
    "preview": preview,
}
```

Keep the web-safe call possible with:

```python
apply.run_apply(replace=False, run_preflight=True, progress=job.append_log)
```

Keep `main()` as the argparse adapter and preserve all existing flags.

- [ ] **Step 5: Test preview and dry-run orchestration**

Add a test that monkeypatches `M.load_json`, `M.rest_get`, and `do_folder`, calls `run_apply(dry_run=True)`, and asserts `preflight()` is not called and no state write occurs.

Run: `python -m pytest bot/tests/test_apply_api.py -v`

Expected: all tests pass.

- [ ] **Step 6: Verify CLI compatibility and commit**

Run: `python bot/apply.py --help`

Expected: exit 0 and all six existing flags remain visible.

```bash
git add bot/apply.py bot/tests/test_apply_api.py
git commit -m "refactor: expose safe upload workflow"
```

---

### Task 3: Return structured verification results

**Files:**
- Modify: `bot/verify.py:20-165`
- Create: `bot/tests/test_verify_api.py`

**Interfaces:**
- Produces: `verify.run_verify(plan: dict | None = None, state: dict | None = None, progress: Callable[[str], None] | None = None, write: bool = True) -> dict`
- Result keys: `checked`, `problems`, `report_path`, `ok`

- [ ] **Step 1: Write the failing verification contract test**

```python
# bot/tests/test_verify_api.py
import verify


def test_run_verify_returns_problem_summary(monkeypatch, tmp_path):
    plan = {"month_th": "กันยายน", "root": "X", "scanned_at": "now", "folders": [
        {"folder": "IRJ-2026091", "status": "ready", "date_iso": "2026-09-01", "images": ["back.png"]},
    ]}
    state = {"IRJ-2026091": {"status": "done"}}
    monkeypatch.setattr(verify.C, "REPORT_MD", str(tmp_path / "report.md"))
    monkeypatch.setattr(verify.M, "rest_get", lambda table, query: [] if table == verify.C.T_ORDERS else [])

    result = verify.run_verify(plan=plan, state=state, write=False)

    assert result["ok"] is False
    assert result["problems"][0]["folder"] == "IRJ-2026091"
    assert "ไม่พบแถวออเดอร์" in result["problems"][0]["messages"][0]
```

- [ ] **Step 2: Run the test and verify failure**

Run: `python -m pytest bot/tests/test_verify_api.py -v`

Expected: FAIL because `run_verify` does not exist.

- [ ] **Step 3: Extract `run_verify()` and retain report formatting**

Move the body of `main()` into `run_verify()`, represent each checked row as `{"folder": folder, "messages": bad}`, call `write_report()` when `write=True`, and return:

```python
return {
    "checked": checked_items,
    "problems": [item for item in checked_items if item["messages"]],
    "report_path": C.REPORT_MD if write else None,
    "ok": not any(item["messages"] for item in checked_items),
}
```

Update `write_report()` to accept the structured list while keeping the generated Markdown content equivalent. Keep `main()` responsible only for printing the final summary.

- [ ] **Step 4: Run tests and CLI smoke test**

Run: `python -m pytest bot/tests/test_verify_api.py -v`

Expected: pass.

Run: `python bot/verify.py --help`

Expected: process starts without import or syntax errors; because the script has no flags, use `python -m py_compile bot/verify.py` as the non-network smoke test.

- [ ] **Step 5: Commit callable verification**

```bash
git add bot/verify.py bot/tests/test_verify_api.py
git commit -m "refactor: expose verification results"
```

---

### Task 4: Build the local service and state projection

**Files:**
- Create: `bot/web_service.py`
- Create: `bot/tests/test_web_service.py`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `scan.run_scan`, `apply.build_apply_preview`, `apply.run_apply`, `verify.run_verify`
- Produces: `discover_months(year_root: str) -> list[dict]`
- Produces: `resolve_month_root(mode: str, path: str, month_folder: str | None = None) -> str`
- Produces: `load_dashboard_status() -> dict`
- Produces: singleton `jobs: JobManager`
- `JobManager.start(kind: str, target: Callable[[], dict]) -> dict`
- `JobManager.snapshot(after: int = 0) -> dict`

- [ ] **Step 1: Write failing folder and status tests**

```python
# bot/tests/test_web_service.py
import json
from pathlib import Path
import pytest
import web_service


def test_discover_months_sorts_and_ignores_unrelated_folders(tmp_path):
    (tmp_path / "10.ตุลาคม").mkdir()
    (tmp_path / "2.กุมภาพันธ์").mkdir()
    (tmp_path / "เอกสาร").mkdir()
    found = web_service.discover_months(str(tmp_path))
    assert [item["number"] for item in found] == [2, 10]
    assert found[0]["folder"] == "2.กุมภาพันธ์"


def test_resolve_month_root_rejects_escape(tmp_path):
    year = tmp_path / "ปี2569"
    year.mkdir()
    with pytest.raises(ValueError, match="โฟลเดอร์เดือน"):
        web_service.resolve_month_root("year", str(year), "..\\outside")


def test_status_waits_for_dates(monkeypatch, tmp_path):
    plan_path = tmp_path / "plan.json"
    plan_path.write_text(json.dumps({"folders": [
        {"folder": "IRJ-2026091", "status": "ready", "date_iso": None}
    ]}), encoding="utf-8")
    monkeypatch.setattr(web_service.C, "PLAN_JSON", str(plan_path))
    assert web_service.load_dashboard_status()["phase"] == "waiting_for_dates"
```

- [ ] **Step 2: Run service tests and verify failure**

Run: `python -m pytest bot/tests/test_web_service.py -v`

Expected: FAIL because `web_service` does not exist.

- [ ] **Step 3: Implement folder discovery and safe root resolution**

Use `scan.root_month()` for month recognition. Resolve the year root and candidate, then require `os.path.commonpath([year, candidate]) == year` and require the candidate parent to equal the year root. Return month records shaped as:

```python
{"number": 9, "name": "กันยายน", "folder": "9.กันยายน", "path": absolute_path}
```

For direct mode, require an existing directory and a recognized month. For year mode, require `month_folder` to match one of `discover_months(path)` exactly.

- [ ] **Step 4: Implement settings without secrets**

Set `SETTINGS_JSON = os.path.join(C.BOT_DIR, "web_settings.json")`. Implement:

```python
def load_settings():
    return M.load_json(SETTINGS_JSON, {"mode": "month", "path": ""})

def save_settings(mode, path):
    M.save_json(SETTINGS_JSON, {"mode": mode, "path": path})
```

Add `bot/web_settings.json` to `.gitignore`.

- [ ] **Step 5: Implement dashboard projection and preview token**

`load_dashboard_status()` must count each folder status, expose only display fields (`folder`, `status`, `date_iso`, `image_count`, `reason`, `warnings`, `crop`), and choose phase using this order:

1. active job phase from `JobManager`
2. `idle` when plan is missing
3. `waiting_for_dates` when a ready record lacks `date_iso`
4. `ready_to_upload` when at least one ready record has a date and is not done/duplicate
5. `complete` when every uploadable record is done

Generate the apply confirmation token as SHA-256 of normalized JSON containing `plan.scanned_at`, sorted ready folder names, and dates. Do not include the Supabase key.

- [ ] **Step 6: Implement the one-job manager**

Use a daemon `threading.Thread`, a `threading.Lock`, monotonic log sequence numbers, and these snapshot keys:

```python
{
    "active": bool,
    "kind": "scan" | "apply" | "verify" | None,
    "phase": str,
    "started_at": str | None,
    "finished_at": str | None,
    "result": dict | None,
    "error": str | None,
    "logs": [{"seq": int, "text": str}],
    "next": int,
}
```

`start()` raises `RuntimeError("มีงานกำลังทำอยู่")` while active. The worker catches `Exception`, stores a Thai-safe error message, and always releases active state in `finally`.

- [ ] **Step 7: Run service tests and commit**

Run: `python -m pytest bot/tests/test_web_service.py -v`

Expected: all tests pass.

```bash
git add .gitignore bot/web_service.py bot/tests/test_web_service.py
git commit -m "feat: add local scan service"
```

---

### Task 5: Expose a local-only Flask API

**Files:**
- Create: `bot/web_app.py`
- Create: `bot/requirements.txt`
- Create: `bot/tests/test_web_app.py`

**Interfaces:**
- Consumes: public functions and `jobs` from Task 4
- Produces: `web_app.create_app(test_config: dict | None = None) -> Flask`
- Produces: routes defined in the approved spec

- [ ] **Step 1: Add pinned-compatible dependencies**

```text
# bot/requirements.txt
Flask>=3.0,<4
Pillow>=10,<13
requests>=2.31,<3
pytest>=8,<10
```

- [ ] **Step 2: Write failing API security and behavior tests**

```python
# bot/tests/test_web_app.py
import web_app


def make_client():
    app = web_app.create_app({"TESTING": True})
    return app.test_client()


def test_status_does_not_expose_supabase_key(monkeypatch):
    monkeypatch.setattr(web_app.S, "load_dashboard_status", lambda: {"phase": "idle"})
    response = make_client().get("/api/status", headers={"Host": "127.0.0.1:8765"})
    assert response.status_code == 200
    assert "SUPABASE" not in response.get_data(as_text=True)


def test_mutation_rejects_remote_origin():
    response = make_client().post(
        "/api/scan",
        json={"mode": "month", "path": "X"},
        headers={"Host": "127.0.0.1:8765", "Origin": "https://example.com"},
    )
    assert response.status_code == 403


def test_apply_requires_current_confirmation_token(monkeypatch):
    monkeypatch.setattr(web_app.S, "current_preview_token", lambda: "right-token")
    response = make_client().post(
        "/api/apply", json={"confirmation_token": "old-token"},
        headers={"Host": "127.0.0.1:8765"},
    )
    assert response.status_code == 409
```

- [ ] **Step 3: Run tests and verify failure**

Run: `python -m pytest bot/tests/test_web_app.py -v`

Expected: FAIL because `web_app` does not exist.

- [ ] **Step 4: Implement the app factory and local guard**

Use `Flask(__name__, static_folder="web", static_url_path="/static")`. Before mutating requests (`POST`, `PUT`, `PATCH`, `DELETE`), accept only Host values beginning with `127.0.0.1` or `localhost`; if Origin exists, parse it and require the same hostname. Return errors as:

```python
{"ok": False, "error": "ข้อความภาษาไทย"}
```

Never serialize module `config`, exception locals, request environment, or headers.

- [ ] **Step 5: Implement read routes**

- `/` returns `bot/web/index.html`
- `/api/status` returns `S.load_dashboard_status()`
- `/api/jobs/current?after=N` returns `S.jobs.snapshot(after=N)`
- `/api/plan` returns the sanitized plan summary plus `confirmation_token`
- `/api/report` reads UTF-8 Markdown and returns `{exists, markdown}`
- `/api/crops/<folder>` resolves only the crop filename referenced by that folder in the current plan, checks the resolved parent equals `C.CROP_DIR`, then uses `send_file`

- [ ] **Step 6: Implement mutation routes**

- `/api/folder-dialog`: call `S.select_folder(initial)` and return `{path}`; cancel returns `{path: null}`
- `/api/discover-months`: call `S.discover_months(path)`
- `/api/scan`: call `S.resolve_month_root()`, save settings, and start a job whose target is `scan.run_scan(root, progress=S.jobs.append_log)`
- `/api/apply`: compare the submitted token with `S.current_preview_token()` using `hmac.compare_digest`; start `apply.run_apply(replace=False, run_preflight=True, progress=...)`; after success call `verify.run_verify(progress=...)` in the same job
- `/api/verify`: start `verify.run_verify(progress=...)`

Return HTTP 409 for stale tokens or busy jobs, 400 for invalid paths/input, and 500 only for unexpected server errors.

- [ ] **Step 7: Add Windows folder dialog helper**

Implement `select_folder(initial)` in `web_service.py` with `tkinter.Tk()`, `withdraw()`, `attributes("-topmost", True)`, `filedialog.askdirectory(initialdir=initial or C.ROOT)`, and `destroy()` in `finally`. Convert Tcl/Tk failures to `RuntimeError("เปิดหน้าต่างเลือกโฟลเดอร์ไม่ได้ กรุณาวางพาธในช่องแทน")`.

- [ ] **Step 8: Run API and full backend tests**

Run: `python -m pytest bot/tests -v`

Expected: all tests pass without network calls.

- [ ] **Step 9: Commit the local API**

```bash
git add bot/web_app.py bot/web_service.py bot/requirements.txt bot/tests/test_web_app.py
git commit -m "feat: add local scan web API"
```

---

### Task 6: Build the Thai scan-control interface

**Files:**
- Create: `bot/web/index.html`
- Create: `bot/web/styles.css`
- Create: `bot/web/app.js`

**Interfaces:**
- Consumes: Task 5 JSON endpoints
- Produces: UI controls with element IDs `mode-month`, `mode-year`, `root-path`, `browse-folder`, `month-select`, `scan-button`, `job-log`, `summary-strip`, `orders-body`, `apply-button`, `verify-button`, `crop-dialog`, `confirm-dialog`

- [ ] **Step 1: Create the semantic HTML structure**

Build a Thai document with:

```html
<main class="workspace">
  <header class="masthead">ตัวควบคุมงานบัตรรับประกัน + server status</header>
  <section class="control-desk" aria-labelledby="source-title">
    <form id="source-form">mode radios, path, browse, month select, scan</form>
    <aside aria-live="polite">phase, progress, latest log</aside>
  </section>
  <section id="summary-strip" aria-label="สรุปผลสแกน"></section>
  <section class="ledger">filter controls + results table</section>
  <footer>apply, verify, and local-only notice</footer>
</main>
```

Include a native `<dialog id="crop-dialog">` for crop preview and `<dialog id="confirm-dialog">` that repeats the exact order/image counts before upload. Buttons must use direct labels: “เลือกโฟลเดอร์”, “สแกนเดือนนี้”, “อัปโหลดรายการที่พร้อม”, “ตรวจสอบอีกครั้ง”.

- [ ] **Step 2: Implement the subject-specific visual system**

Use this compact token system in `styles.css`:

```css
:root {
  --ink: #17243b;
  --paper: #f5f7fb;
  --surface: #ffffff;
  --rule: #cbd3df;
  --muted: #637087;
  --ready: #0f766e;
  --warning: #ad5b12;
  --danger: #b42318;
  --action: #175cd3;
  --focus: #84adff;
  --radius: 6px;
  font-family: "Leelawadee UI", "Noto Sans Thai", Tahoma, sans-serif;
}
```

Make the memorable element the ledger-style status table: fixed status rail, compact rows, legible Thai text, and crop thumbnail drawer. Keep surfaces flat, use borders to encode structure, reserve blue for the primary action, and avoid decorative gradients/shadows. At widths below 760px stack the two control panels and convert each table row into a labeled grid. Add visible `:focus-visible` outlines and a `prefers-reduced-motion` rule.

- [ ] **Step 3: Implement initial load and polling**

In `app.js`, keep one state object:

```javascript
const state = {
  status: null,
  jobCursor: 0,
  confirmationToken: null,
  selectedStatus: "all",
  pollTimer: null,
};
```

On `DOMContentLoaded`, fetch `/api/status` and `/api/plan`, render, then poll `/api/jobs/current?after=${state.jobCursor}` every 1200 ms only while a job is active or phase is `waiting_for_dates`. Refresh `/api/status` and `/api/plan` after every job completion and every 4 seconds while waiting for Codex.

- [ ] **Step 4: Implement folder selection flows**

- Mode month: path is the final scan root and month select is hidden
- Mode year: POST path to `/api/discover-months`, populate options with `folder` as value, and require a selection
- Browse button POSTs `/api/folder-dialog` with current path, then triggers discovery/validation
- Surface server error text next to the relevant control and focus that control

- [ ] **Step 5: Render status, table, crop and actionable errors**

Map raw statuses to Thai labels without changing raw data:

```javascript
const LABELS = {
  ready: "พร้อม",
  no_cert: "ไม่พบบัตรด้านหลัง",
  ambiguous: "พบบัตรด้านหลังหลายใบ",
  ambiguous_subfolder: "โฟลเดอร์ซ้อนกำกวม",
  date_failed: "วันที่ไม่ผ่านการตรวจ",
  card_mismatch: "เลขบัตรไม่ตรง",
  error: "สแกนไม่สำเร็จ",
};
```

Render text through `textContent`, never `innerHTML`. Crop buttons use the encoded folder path from `/api/crops/<folder>`. Empty state says “ยังไม่มีผลสแกน เลือกเดือนแล้วกดสแกนเดือนนี้”. Waiting state shows the exact Codex command from the API.

- [ ] **Step 6: Implement scan, confirmation, upload and verify actions**

Disable action buttons during active jobs. Scan POST body is `{mode, path, month_folder}`. Upload opens the confirm dialog first; confirmation POST body is `{confirmation_token: state.confirmationToken}`. A stale-token 409 closes the dialog, refreshes preview, and displays “ข้อมูลเปลี่ยนแล้ว กรุณาตรวจรายการล่าสุดก่อนอัปโหลด”.

- [ ] **Step 7: Perform static and browser checks**

Run: `python -m py_compile bot/web_app.py bot/web_service.py`

Expected: no output and exit 0.

Start: `python bot/web_app.py`

Open: `http://127.0.0.1:8765`

Verify desktop and narrow layouts, keyboard navigation, folder modes, empty state, mocked error state, crop dialog, upload confirmation, and live log behavior. Confirm browser devtools show no Supabase key and no JavaScript errors.

- [ ] **Step 8: Commit the interface**

```bash
git add bot/web/index.html bot/web/styles.css bot/web/app.js
git commit -m "feat: add Thai scan control dashboard"
```

---

### Task 7: Add launcher, documentation and end-to-end regression checks

**Files:**
- Create: `bot/start_web.bat`
- Modify: `bot/README.md`
- Modify: `bot/tests/test_web_app.py`

**Interfaces:**
- Consumes: completed backend and frontend
- Produces: double-click launcher and operator instructions

- [ ] **Step 1: Create the Windows launcher**

```bat
@echo off
setlocal
cd /d "%~dp0"
python -c "import flask, PIL, requests" 2>nul
if errorlevel 1 (
  echo กรุณาติดตั้ง dependencies ด้วย: python -m pip install -r requirements.txt
  pause
  exit /b 1
)
start "" http://127.0.0.1:8765
python web_app.py
endlocal
```

Ensure `web_app.py` ends with:

```python
if __name__ == "__main__":
    create_app().run(host="127.0.0.1", port=8765, debug=False, threaded=True)
```

- [ ] **Step 2: Add an end-to-end Flask test with fakes**

Extend `test_web_app.py` to monkeypatch `scan.run_scan`, `apply.run_apply`, and `verify.run_verify`. Exercise `/api/scan` → job snapshot → sanitized `/api/plan` → `/api/apply` with current token → `/api/report`. Assert the apply fake receives `replace=False` and `run_preflight=True`, and assert a second concurrent mutation returns 409.

- [ ] **Step 3: Document installation and exact operator flow**

Add these sections to `bot/README.md`:

- ติดตั้งครั้งแรก: `python -m pip install -r bot/requirements.txt`
- เปิดหน้าเว็บ: double-click `bot/start_web.bat` or run `python bot/web_app.py`
- เลือกโฟลเดอร์เดือนและเลือกโฟลเดอร์ปี
- หลัง scan ให้ส่งคำสั่งที่หน้าเว็บแสดงใน Codex
- กลับมาดู preview แล้วกดยืนยันอัปโหลด
- ความหมายของแต่ละสถานะและวิธีลองใหม่
- CLI เดิมยังใช้ได้ พร้อมตัวอย่างเดิม
- server เปิดเฉพาะ `http://127.0.0.1:8765`

- [ ] **Step 4: Run the full automated suite**

Run: `python -m pytest bot/tests -v`

Expected: all tests pass with no real Supabase writes.

Run: `python -m py_compile bot/*.py`

On PowerShell, use: `Get-ChildItem bot -Filter *.py | ForEach-Object { python -m py_compile $_.FullName }`

Expected: every file compiles without output.

- [ ] **Step 5: Perform safe manual smoke tests**

1. Start the server and verify it listens only on `127.0.0.1:8765`.
2. Use a temporary year directory containing `8.สิงหาคม`, `9.กันยายน`, and an unrelated folder; verify only two months appear.
3. Select a real month and run scan with no upload; compare `plan.json` counts with `python bot/scan.py --root <same-path> --dry-run`.
4. Confirm crop previews resolve only current-plan folders; request `../config.py` and verify 404.
5. Run apply dry-run from CLI against the generated plan.
6. For a real upload test, select one known missing folder, confirm the preview count is one, allow pre-flight, upload, verify the back-card image is first, and run verify.
7. Confirm existing orders are listed as skipped and never overwritten.

- [ ] **Step 6: Review the working tree before the final commit**

Run: `git status --short`

Expected: only files in this plan are staged for this feature; preserve the user's pre-existing modifications in `css/components.css`, `index.html`, and `js/app.js`.

- [ ] **Step 7: Commit launcher, tests and docs**

```bash
git add bot/start_web.bat bot/README.md bot/tests/test_web_app.py
git commit -m "docs: add local scan web workflow"
```

- [ ] **Step 8: Final verification report**

Report the automated test count, manual checks completed, files added/changed, exact launch command, and any manual real-upload check intentionally skipped to avoid writing production data without explicit user direction.

