"""Verify assembly inspection in the production browser and capture the review figures."""

import argparse
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument("url")
parser.add_argument("output", type=Path)
parser.add_argument("--preview", action="store_true")
parser.add_argument("--first-inspection", action="store_true")
parser.add_argument("--chromium")
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)

with sync_playwright() as pw:
    browser = pw.chromium.launch(
        executable_path=args.chromium,
        args=["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    )
    page = browser.new_page(viewport={"width": 1536, "height": 980})
    page.set_default_timeout(60000)
    expect.set_options(timeout=60000)
    errors, posts = [], []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on(
        "request", lambda req: posts.append(req.url) if req.method == "POST" else None
    )
    el = page.locator

    def click(sel):
        el(sel).click()

    def stage(key):
        click("#process")
        click("[data-card=prism-" + key + "]")
        expect(el("#workspace")).to_be_visible()
        expect(el("[data-key=prism-" + key + "]")).to_have_attribute(
            "aria-pressed", "true"
        )

    def option(key):
        click("[data-view=" + key + "]")

    def shot(name):
        page.mouse.move(1, 1)
        page.evaluate(
            "new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))"
        )
        el("#workspace article").screenshot(path=args.output / (name + ".png"))

    page.goto(args.url.rstrip("/") + "/#prismatic")
    expect(el("#engine")).to_contain_text("읽기 전용" if args.preview else "실시간")
    stage("stack")
    click("#labels")
    expect(el("#labels")).to_have_attribute("aria-pressed", "false")
    shot("01-stack")
    option("foil")
    shot("01b-foil")
    click("#process")
    click("#parallel-cap")
    expect(el("[data-part=collector]")).to_be_visible()
    option("top")
    shot("cap-top")
    option("bottom")
    shot("cap-underside")
    option("underside")
    shot("cap-underside-detail")
    stage("join")
    click("#fit")
    shot("02-joined")
    option("before")
    expect(el("[data-part=joint]")).to_have_count(0)
    shot("02a-before")
    option("assembly")
    expect(el("[data-part=joint]")).to_be_visible()
    shot("02b-after")
    option("interface")
    shot("02c-interface")
    if not args.first_inspection:
        stage("insulate")
        click("#fit")
        shot("03-insulated")
        option("bare")
        expect(el("[data-part=insulation]")).to_have_count(0)
        shot("03b-bare")
        option("assembly")
        option("bottom")
        shot("03c-bottom")
        option("top")
        click("#uncover")
        shot("03d-open-top")
        stage("insert")
        option("empty")
        expect(el("#parts button")).to_have_count(1)
        shot("04a-empty")
        option("assembly")
        for travel, name in [
            (95, "04b-approach"),
            (45, "04c-middle"),
            (0, "04-seated"),
        ]:
            click(f'[data-travel="{travel}"]')
            expect(el(f'[data-travel="{travel}"]')).to_have_attribute(
                "aria-pressed", "true"
            )
            click("#fit")
            shot(name)
        stage("weld")
        click("#fit")
        expect(el("[data-part=joint]")).to_be_visible()
        expect(el("[data-part=weld]")).to_be_visible()
        shot("05-finished")
        click("[data-part=weld]")
        option("seam")
        shot("05b-perimeter")
        option("internal")
        expect(el("[data-part=can]")).to_have_count(0)
        click("#components")
        click("[data-card=terminal-a]")
        if args.preview:
            expect(el("[name=T05]")).to_be_disabled()
            assert not posts, posts
        else:
            el("[name=T05]").fill("5")
            click("#apply")
            expect(el("[name=T05]")).to_have_value("5")
            for key in ["join", "insulate", "insert", "weld"]:
                with page.expect_response(
                    lambda r: r.url.endswith("/api/rebuild")
                    and r.request.post_data_json["project"]["stage"] == "prism-" + key
                ) as result:
                    stage(key)
                m = result.value.json()
                assert m["features"]["T05"]["value"] == 5
                assert m["features"]["T10"]["value"] == 4
                assert m["features"]["K03"]["value"] == 2
                assert abs(m["features"]["A06"]["value"] - 1.75) < 1e-6
    assert not errors, errors
    print("PASS", ("recorded" if args.preview else "live"), args.output, flush=True)
