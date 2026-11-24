"""Exercise the production UI and its real responses. Serve the built app first."""

import argparse
import json
from pathlib import Path
from tempfile import TemporaryDirectory

from playwright.sync_api import expect, sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument("url")
parser.add_argument("--preview", action="store_true")
parser.add_argument("--screenshots", type=Path)
parser.add_argument("--chromium")
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
with sync_playwright() as pw, TemporaryDirectory() as temp:
    browser = pw.chromium.launch(
        executable_path=args.chromium,
        args=[
            "--no-sandbox",
            "--use-gl=angle",
            "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader",
        ],
    )
    page = browser.new_page(viewport={"width": 1480, "height": 1050}, has_touch=True)
    page.set_default_timeout(90000)
    expect.set_options(timeout=60000)
    errors, posts, models = [], [], []

    def capture(response):
        if response.url.endswith("/api/rebuild") and response.status == 200:
            try:
                models.append(response.json())
            except Exception:
                pass  # A navigation can cancel an old response.

    page.on("response", capture)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("request", lambda r: posts.append(r.url) if r.method == "POST" else None)
    by = page.locator

    def shot(name):
        if args.screenshots:
            args.screenshots.mkdir(parents=True, exist_ok=True)
            page.screenshot(
                path=str(args.screenshots / (name + ".png")), full_page=True
            )

    def stage(key):
        by("#process").click()
        by('[data-card="prism-' + key + '"]').click()
        expect(by("#scene-title")).to_contain_text(
            {
                "insert": "캔 삽입",
                "join": "접합",
                "weld": "용접",
                "insulate": "절연",
                "stack": "스택",
            }[key]
        )

    def part(key):
        by("#components").click()
        expect(by("[data-card]")).to_have_count(8)
        by('[data-card="' + key + '"]').click()
        expect(by("[data-part="+key+"]")).to_be_visible()

    def input_value(key, value):
        by('[name="' + key + '"]').fill(str(value))
        by("#apply").click()
        expect(by('[name="' + key + '"]')).to_have_value(str(value))

    def gap(key, value):
        expect(by("[data-measure=" + key + "] output")).to_have_text(value + " mm")

    def clean():
        by("#file").set_input_files(str(root / "examples/prismatic.json"))
        expect(by("#scene-title")).to_contain_text("스택 준비")

    def select_measure(key):
        by("[data-measure=" + key + "] button").focus()
        expect(by("#measure-label")).to_contain_text(key)

    page.goto(args.url.rstrip("/") + "/#prismatic")
    expect(by("#engine")).to_contain_text("읽기 전용" if args.preview else "실시간 CAD")
    expect(by("[data-card]")).to_have_count(5)
    for key in ["stack", "join", "insulate", "insert", "weld"]:
        stage(key)
    expect(by("#approval")).to_have_text("둘레 용접 표시")
    stage("insert")
    by('[data-travel="95"]').click()
    expect(by("#approval")).to_contain_text("95.00")
    by("#fit").click()
    shot("01-before-insertion")
    by('[data-travel="0"]').click()
    expect(by("#approval")).to_have_text("안착 완료")
    gap("A04", "2.05")
    gap("A05", "1.45")
    if not args.preview:
        before = next(
            m
            for m in reversed(models)
            if m["stage"] == "prism-insert" and m["approval"]["seated"]
        )
    by("[data-part=can]").click()
    expect(by("[data-part=can]")).to_have_attribute("aria-pressed", "true")
    by("[data-part=can]").click()
    select_measure("A05")
    expect(by("#section")).to_have_value("x")
    shot("02-seated-section")
    by("#overview").click()
    expect(by("[data-card]")).to_have_count(5)
    part("stack")
    by("[data-measure=S02] button").tap()
    expect(by("#measure-label")).to_contain_text("S02")
    if args.preview:
        for q in ["#save", "#open", "#apply", "[name=S02]"]:
            expect(by(q)).to_be_disabled()
        stage("insert")
        by("button", has_text="기록 사례").click()
        expect(by("#diagnostics")).to_contain_text("+Y -0.55")
        select_measure("A05")
        shot("03-interference")
        by('[data-travel="95"]').click()
        expect(by("#errors")).to_contain_text("기록되지 않은")
        gap("A05", "-0.55")
        assert not posts, posts
    else:
        by("[name=S02]").fill("31")
        page.get_by_role("button", name="입력 취소").click()
        expect(by("[name=S02]")).to_have_value("28")
        input_value("S02", 30)
        by("#undo").click()
        expect(by("[name=S02]")).to_have_value("28")
        by("#redo").click()
        expect(by("[name=S02]")).to_have_value("30")
        stage("insulate")
        gap("I04", "30.50")
        stage("insert")
        gap("A04", "1.05")
        gap("A05", "0.45")
        after = next(
            m
            for m in reversed(models)
            if m["stage"] == "prism-insert"
            and abs(m["features"]["A05"]["value"] - 0.45) < 1e-6
        )
        assert before["datums"] == after["datums"]
        old, new = [{p["id"]: p["bounds"] for p in m["parts"]} for m in [before, after]]
        assert old["cap"] == new["cap"] and old["can"] == new["can"]
        for side, change in [("min", -1), ("max", 1)]:
            assert abs(new["stack"][side][1] - old["stack"][side][1] - change) < 1e-7
        with page.expect_download() as event:
            by("#save").click()
        saved = Path(temp) / "cell.json"
        event.value.save_as(str(saved))
        stored = json.loads(saved.read_text())
        assert (
            stored["productType"] == "prismatic"
            and stored["product"]["values"]["S02"] == 30
        )
        clean()
        part("stack")
        input_value("S02", 32)
        stage("insert")
        gap("A05", "-0.55")
        expect(by("#approval")).to_contain_text("진단")
        expect(by("#diagnostics")).to_contain_text("+Y -0.55")
        select_measure("A05")
        shot("03-interference")
        clean()
        stage("join")
        input_value("J02", 10)
        gap("J04", "0.00")
        expect(by("#diagnostics")).to_contain_text("접합 불성립")
        clean()
        part("cap")
        input_value("K02", 34)
        stage("insert")
        gap("A09", "0.50")
        stage("weld")
        expect(by("#diagnostics")).to_contain_text("용접 완료 차단")
        expect(by("[data-part=weld]")).to_have_count(0)
        page.reload()
        expect(by("[data-card]")).to_have_count(5)
        by("#file").set_input_files(str(saved))
        gap("A05", "0.45")
        by("#file").set_input_files(str(root / "examples/demo.json"))
        expect(by('#product-types [href="#pouch"]')).to_have_attribute(
            "aria-current", "page"
        )
        expect(by("#status")).to_contain_text("CAD 확정", timeout=180000)
        by("#file").set_input_files(str(saved))
        gap("A05", "0.45")
    by('#product-types [href="#pouch"]').click()
    expect(by("#component-overview")).to_be_visible()
    by('#product-types [href="#prismatic"]').click()
    expect(by("[data-card]")).to_have_count(5)
    assert not errors, errors
    print(
        "PASS",
        "recorded read-only" if args.preview else "live CAD",
        "five stages, section, product routing",
        flush=True,
    )
