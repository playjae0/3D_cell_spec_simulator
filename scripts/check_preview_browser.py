"""Playwright matrix and controls for the built R5 preview and real CAD app.

Install Python Playwright and its Chromium browser (or set POUCH_CHROMIUM).
Run from the repository root after both builds. --live takes an existing
cad/server.py URL; that check also serves the preview bundle on the CAD origin.
"""
import argparse
from contextlib import contextmanager
import hashlib
import http.client
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import subprocess
from pathlib import Path
from threading import Event, Thread
from urllib.parse import urlsplit

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PREFIX = "/review/r5"
HEALTH = "/api/health"
EXAMPLES = {
    "demo": ("#preview-demo", "stacked"),
    "pouch-process": ("#pouch-example", "sealed"),
    "process-tooling-r4": ("#r4-example", "preweld"),
    "pouch-phase1": ("#phase1-example", "tab_sealed"),
}
GROUPS = {"stack", "positive", "negative", "pouch", "seal", "tool"}


@contextmanager
def static_host(folder, mutate=None, api=None, prefix=PREFIX):
    requests = []

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(folder), **kwargs)

        def log_message(self, *_):
            pass

        def relay(self):
            target = urlsplit(api)
            with_connection = http.client.HTTPConnection(target.hostname, target.port, timeout=180)
            try:
                size = int(self.headers.get("Content-Length", "0"))
                with_connection.request(self.command, self.path, self.rfile.read(size) if size else None,
                                        {"Content-Type": "application/json"})
                reply = with_connection.getresponse()
                body = reply.read()
                self.send_response(reply.status)
                self.send_header("Content-Type", reply.getheader("Content-Type"))
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            finally:
                with_connection.close()

        def do_POST(self):
            requests.append((self.command, self.path))
            if api and self.path.startswith("/api/"):
                self.relay()
            else:
                self.send_error(405)

        def do_GET(self):
            requests.append((self.command, self.path))
            if api and self.path.startswith("/api/"):
                return self.relay()
            if not self.path.startswith(prefix + "/"):
                return self.send_error(404)
            self.path = self.path.removeprefix(prefix)
            body = mutate(self.path) if mutate else None
            if body is None:
                return super().do_GET()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    with ThreadingHTTPServer(("127.0.0.1", 0), Handler) as server:
        worker = Thread(target=server.serve_forever, daemon=True)
        worker.start()
        try:
            yield f"http://127.0.0.1:{server.server_port}{prefix}/", requests
        finally:
            server.shutdown()
            worker.join()


def instrument(page):
    faults, console = [], []
    page.on("pageerror", lambda error: faults.append(str(error)))
    page.on("console", lambda message: console.append(message) if message.type == "error" else None)
    return faults, console


def no_errors(faults, console, health_failure=True):
    assert not faults, faults
    if health_failure:
        assert len(console) <= 1, [(m.text, m.location) for m in console]
        if console:
            assert console[0].location["url"].endswith(HEALTH), console[0].location
    else:
        assert not console, [(m.text, m.location) for m in console]


def load_dataset(folder, design):
    return json.loads((folder / "preview" / design["file"]).read_bytes())


def restored(dataset, stage):
    entry = dataset["stages"][stage]
    if entry["status"] == 422:
        return json.loads(entry["body"])
    body = "".join(fragment + dataset["parts"][ref]
                   for fragment, ref in zip(entry["fragments"], entry["refs"]))
    return json.loads(body + entry["fragments"][-1])


def expect_stage(page, stage, dataset, label, recorded=True):
    expect(page.locator("#stage")).to_have_value(stage)
    expect(page.locator("#status")).to_contain_text(("기록 확정 · " if recorded else "CAD 확정 · ") + label)
    names = sorted(part["name"] + " 표시" for part in restored(dataset, stage)["parts"]
                   if part["id"].split(".")[0] in GROUPS)
    rows = page.locator("#parts .part-row input")
    expect(rows).to_have_count(len(names))
    assert sorted(rows.evaluate_all("(rows) => rows.map(row => row.ariaLabel)")) == names
    assert page.locator("#viewport canvas").count() >= 1


def enter_demo(page, url):
    page.goto(url)
    expect(page.locator("#status")).to_contain_text("기록 확정")
    page.locator('.process-card[data-stage="tab_sealed"]').click()
    page.locator("#preview-demo").click()
    expect(page.locator("#status")).to_contain_text("기록 확정 · S0")


def matrix(browser, folder):
    manifest = json.loads((folder / "preview/manifest.json").read_bytes())
    labels = {key: info["label"] for key, info in json.loads((ROOT / "src/data/stages.json").read_bytes()).items()}
    with static_host(folder) as (url, requests):
        page = browser.new_page()
        faults, console = instrument(page)
        page.goto(url)
        expect(page.locator("#status")).to_contain_text("기록 확정")
        expect(page.locator("#overview-model")).to_contain_text("phase1-1")
        page.locator('.process-card[data-stage="tab_sealed"]').click()
        expect(page.locator("#engine-state")).to_have_text(
            "읽기 전용 프리뷰 · 사전 계산 형상(" + manifest["sourceCommit"][:7] + ")")
        expect(page.locator("#undo")).to_be_disabled()
        design_requests = lambda: [path.split("/")[-1] for _, path in requests
                                   if path.startswith(PREFIX + "/preview/")]
        assert design_requests() == ["manifest.json", "pouch-phase1.json"], requests
        page.locator("#preview-demo").click()
        expect(page.locator("#status")).to_contain_text("기록 확정 · S0")
        for id in ["save", "open", "step", "models", "apply", "auto-rebuild", "edit-selection"]:
            expect(page.locator("#" + id)).to_be_disabled()
        assert page.locator("#models-dialog").count() == 0
        page.locator("#section").select_option("y")
        page.locator("#section-position").fill("2")
        page.locator("#datums").uncheck()
        page.locator("#dimensions-visible").uncheck()
        page.locator("#parts .part-row input").first.uncheck()
        expect(page.locator("#stage")).to_have_value("stacked")
        assert design_requests() == ["manifest.json", "demo.json"]
        page.locator("#viewport canvas").first.dblclick()
        expect(page.locator("#direct-editor")).not_to_have_attribute("open", "")
        page.locator("#design-tab").click()
        fields = page.locator("[data-field]")
        assert fields.count()
        assert all(fields.evaluate_all("(fields) => fields.map(field => field.disabled)"))
        fields.first.dispatch_event("keydown", {"key": "Enter"})
        expect(page.locator("#undo")).to_be_disabled()
        counts = {200: 0, 422: 0}
        for design in manifest["designs"]:
            selector, current = EXAMPLES[design["name"]]
            dataset = load_dataset(folder, design)
            if selector == "#r4-example":
                page.locator("#tooling-tab").click()
            page.locator(selector).click()
            expect_stage(page, current, dataset, labels[current])
            for stage, code in design["stages"].items():
                if page.locator("#stage option[value='" + stage + "']").is_disabled():
                    # Phase 1 keeps old P/S5/S6 routes out of the current model picker.
                    assert design["name"] == "pouch-phase1"
                    continue
                page.locator("#stage").select_option(stage)
                if code == 200:
                    expect_stage(page, stage, dataset, labels[stage])
                    current = stage
                else:
                    expect(page.locator("#status")).to_contain_text("입력 미적용 · 마지막 확정 형상 유지")
                    assert page.locator("#messages").text_content() == "\n".join(restored(dataset, stage)["errors"])
                    expect(page.locator("#stage")).to_have_value(current)
                    names = sorted(part["name"] + " 표시" for part in restored(dataset, current)["parts"]
                                   if part["id"].split(".")[0] in GROUPS)
                    assert sorted(page.locator("#parts .part-row input").evaluate_all(
                        "(rows) => rows.map(row => row.ariaLabel)")) == names
                counts[code] += 1
            if selector == "#r4-example":
                page.locator("#tooling-tab").click()
                for mode in ["ultrasonic", "gathering", "laser", "seal", "pouch"]:
                    page.locator("#r4-mode").select_option(mode)
                    controls = page.locator("#r4-fields [data-r4-field], #r4-special [data-r4-field]")
                    assert controls.count() and all(controls.evaluate_all("(xs) => xs.map(x => x.disabled)"))
                    locked = {"ultrasonic": ["r4-half-pitch"], "laser": ["r4-grid", "r4-add-spot"]}
                    for button in locked.get(mode, []):
                        expect(page.locator("#" + button)).to_be_disabled()
                for button in ["r4-preview", "r4-apply", "r4-cancel", "r4-dictionary"]:
                    expect(page.locator("#" + button)).to_be_disabled()
                page.locator('[data-r4-stage="film_formed"]').click()
                expect_stage(page, "film_formed", dataset, labels["film_formed"])
        assert len(design_requests()) == 5
        assert not [path for method, path in requests if method == "POST"], requests
        no_errors(faults, console)
        print(f"Static matrix {sum(counts.values())}: {counts}, lazy dataset loads, R4 read-only controls", flush=True)
        page.close()

        page = browser.new_page()
        faults, console = instrument(page)
        enter_demo(page, url)
        demo = load_dataset(folder, manifest["designs"][0])
        expect_stage(page, "stacked", demo, labels["stacked"])
        for stage in ["gathered", "preweld", "welded"]:
            page.locator("#stage").select_option(stage)
            expect_stage(page, stage, demo, labels[stage])
        for action, stage in [("undo", "preweld"), ("undo", "gathered"), ("redo", "preweld")]:
            page.locator("#" + action).click()
            expect_stage(page, stage, demo, labels[stage])
        page.locator("#stage").select_option("pouch_formed")
        expect(page.locator("#status")).to_contain_text("입력 미적용")
        expect(page.locator("#stage")).to_have_value("preweld")
        page.locator("#redo").click()
        expect_stage(page, "welded", demo, labels["welded"])
        page.locator("#pouch-example").click()
        expect(page.locator("#status")).to_contain_text("기록 확정 · " + labels["sealed"])
        page.locator("#compare").click()
        expect(page.locator("#compare-run")).to_have_text("기록 형상 비교")
        page.locator("#compare-stage-b").select_option("folded")
        page.locator("#compare-run").click()
        expect(page.locator("#compare-status")).to_have_text("사전 계산 형상 비교 · CAD 재계산 없음")
        expect(page.locator("#compare-title-a")).to_contain_text(labels["sealed"])
        expect(page.locator("#compare-title-b")).to_contain_text(labels["folded"])
        expect(page.locator("#compare-view-a canvas").first).to_be_visible()
        expect(page.locator("#compare-view-b canvas").first).to_be_visible()
        assert page.locator("#compare-dimensions tr").count() > 0
        no_errors(faults, console)
        print("History, 422 rollback, P2/P4 dual views and delta: PASS", flush=True)
        page.close()
        subprocess.run(["node", "scripts/check_preview_lookup.mjs", url], cwd=ROOT, check=True)


def delayed_and_corrupt(browser, folder):
    manifest_path = folder / "preview/manifest.json"
    manifest = json.loads(manifest_path.read_bytes())
    pouch = next(x for x in manifest["designs"] if x["name"] == "pouch-process")
    body = (folder / "preview" / pouch["file"]).read_bytes()
    arrived, release, sent = Event(), Event(), Event()

    def delay(path):
        if path == "/preview/pouch-process.json":
            arrived.set()
            assert release.wait(10)
            sent.set()
            return body
        return None

    with static_host(folder, delay) as (url, _):
        page = browser.new_page()
        faults, console = instrument(page)
        enter_demo(page, url)
        page.locator("#pouch-example").click()
        assert arrived.wait(10)
        page.locator("#tooling-tab").click()
        page.locator("#r4-example").click()
        release.set()
        assert sent.wait(10)
        expect(page.locator("#stage")).to_have_value("preweld")
        expect(page.locator("#status")).to_contain_text("기록 확정 · S2")
        page.locator("#undo").click()
        expect(page.locator("#status")).to_contain_text("기록 확정 · S0")
        expect(page.locator("#undo")).to_be_enabled()
        no_errors(faults, console)
        page.close()
    print("Delayed old response does not overwrite new geometry/history/error: PASS", flush=True)

    for break_reference in [False, True]:
        data = json.loads(body)
        if break_reference:
            ref = data["stages"]["sealed"]["refs"][0]
            del data["parts"][ref]
        changed = json.dumps(data, ensure_ascii=False).encode()
        if break_reference:
            pouch["sha256"] = hashlib.sha256(changed).hexdigest()
        overrides = {
            "/preview/pouch-process.json": changed,
            "/preview/manifest.json": json.dumps(manifest).encode(),
        }
        with static_host(folder, overrides.get) as (url, _):
            page = browser.new_page()
            faults, console = instrument(page)
            enter_demo(page, url)
            page.locator("#pouch-example").click()
            expect(page.locator("#status")).to_contain_text("마지막 확정 형상 유지")
            expect(page.locator("#messages")).to_contain_text("프리뷰 데이터 로딩 오류")
            expect(page.locator("#messages")).to_contain_text(
                "Missing part reference" if break_reference else "해시 불일치")
            expect(page.locator("#stage")).to_have_value("stacked")
            expect(page.locator("#undo")).to_be_enabled()
            no_errors(faults, console)
            page.close()
    print("Damaged asset and unresolved part keep the accepted model: PASS", flush=True)


def ordinary_build(browser):
    with static_host(ROOT / "dist", prefix="") as (url, requests):
        page = browser.new_page()
        faults, console = instrument(page)
        page.goto(url)
        expect(page.locator("#engine-state")).to_have_text("읽기 전용 · CAD 서버 없음")
        expect(page.locator("#apply")).to_be_disabled()
        expect(page.locator("#compare")).to_be_disabled()
        assert not [path for _, path in requests if "/preview/" in path], requests
        no_errors(faults, console)
        page.close()
    print("Ordinary build with no CAD and no assets: PASS", flush=True)


def live_check(browser, folder, live_url):
    with static_host(folder, api=live_url, prefix=PREFIX if folder.name == "dist-preview" else "") as (url, requests):
        page = browser.new_page()
        page.set_default_timeout(60_000)
        faults, console = instrument(page)
        page.goto(url)
        expect(page.locator("#status")).to_contain_text("CAD 확정", timeout=60_000)
        page.locator('.process-card[data-stage="stacked"]').click()
        expect(page.locator("#status")).to_contain_text("CAD 확정 · S0", timeout=60_000)
        expect(page.locator("#engine-state")).to_contain_text("실시간 CadQuery")
        page.locator("#design-tab").click()
        page.locator("#editor").select_option("stack")
        field = page.locator('[data-field="stack.length"]')
        field.evaluate('(el) => { el.closest("details").open = true; }')
        before = float(field.input_value())
        expect(field).to_be_enabled()
        with page.expect_response(lambda r: r.url.endswith("/api/rebuild") and r.ok, timeout=90_000) as result:
            field.fill(str(before + 1))
        data = result.value.json()
        stack = next(p for p in data["parts"] if p["id"] == "stack")
        assert abs(stack["bounds"]["max"][0] - stack["bounds"]["min"][0] - (before + 1)) < 0.01
        expect(page.locator("#status")).to_contain_text("CAD 확정 · S0", timeout=60_000)
        page.locator("#compare").click()
        expect(page.locator("#compare-run")).to_have_text("독립 CAD 두 개 계산")
        page.locator("#compare-stage-b").select_option("gathered")
        count = requests.count(("POST", "/api/rebuild"))
        page.locator("#compare-run").click()
        expect(page.locator("#compare-status")).to_contain_text("비교 완료", timeout=90_000)
        assert requests.count(("POST", "/api/rebuild")) == count + 2
        assert not [path for _, path in requests if "/preview/" in path], requests
        no_errors(faults, console, health_failure=False)
        page.close()
    print(f"Live health priority, stack length {before} → {before + 1}, comparison POST ×2: PASS", flush=True)


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--live", help="Live local CAD URL for the separate priority check")
    cli.add_argument("--live-only", action="store_true")
    args = cli.parse_args()
    folder = ROOT / "dist-preview"
    executable = os.getenv("POUCH_CHROMIUM")
    with sync_playwright() as playwright:
        with playwright.chromium.launch(executable_path=executable) as browser:
            if not args.live_only:
                matrix(browser, folder)
                delayed_and_corrupt(browser, folder)
                ordinary_build(browser)
            if args.live:
                live_check(browser, folder, args.live)
            elif args.live_only:
                cli.error("--live-only requires --live")


if __name__ == "__main__":
    main()
