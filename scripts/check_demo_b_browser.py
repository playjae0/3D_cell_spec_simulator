"""Exercise both terminal editing modes against the running local CAD app."""

import argparse
import json
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("url")
parser.add_argument("evidence", type=Path)
parser.add_argument("--chromium")
args = parser.parse_args()
args.evidence.mkdir(parents=True, exist_ok=True)

with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=args.chromium, args=["--enable-unsafe-swiftshader"])
    page = browser.new_page(viewport={"width": 1550, "height": 1000})
    page.set_default_timeout(90000)
    expect.set_options(timeout=90000)
    errors = []
    page.on("pageerror", lambda err: errors.append(str(err)))
    by = page.locator
    page.goto(args.url.rstrip("/") + "/#prismatic")

    def shot(name):
        page.mouse.move(1, 1)
        by("#workspace").screenshot(path=args.evidence / (name + ".png"))

    def edit(key, value):
        by(f"[name={key}]").fill(str(value))
        with page.expect_response(lambda r: r.url.endswith("/api/rebuild") and
                                  r.request.post_data_json["project"]["product"]["values"].get(key) == value) as request:
            by("#apply").click()
        response = request.value
        assert response.ok, response.text()
        model = response.json()
        assert model["mode"] == "live-cad"
        expect(by("#save")).to_be_enabled()
        return model

    def save_and_reopen(name, component):
        with page.expect_download() as event:
            by("#save").click()
        path = args.evidence / name
        event.value.save_as(path)
        page.reload()
        expect(by("#open")).to_be_enabled()
        by("#file").set_input_files(path)
        expect(by("#workspace")).to_be_visible()
        by("#components").click()
        by(f"[data-card={component}]").click()
        return json.loads(path.read_text())

    by("#patent-cap").click()
    by("[data-view=underside]").click()
    shot("01-original-cap")
    by("[data-key=terminal-b]").click()
    assert edit("T10", 5)["features"]["T10"]["value"] == 5
    legacy = save_and_reopen("saved-custom.json", "terminal-b")
    assert legacy["product"]["values"]["T10"] == 5 and "terminalSpec" not in legacy["product"]
    expect(by("[name=T10]")).to_have_value("5")
    print("PASS legacy PR17 custom T10 4 -> 5 mm, saved and reopened", flush=True)

    by("#process").click()
    by("#demo-b").click()
    by("[data-view=underside]").click()
    shot("02-demo-b-underside")
    by("[data-view=path-section]").click()
    shot("03-coupling-section")
    by("[data-key=collector]").click()
    expect(by("[data-key=collector]")).to_have_attribute("aria-pressed", "true")
    shot("04-collector")
    by("[data-key=cap]").click()
    for k in (2, 3):
        if k == 3:
            assert edit("K03", 3)["features"]["T10"]["value"] == 3
        row = by("[data-measure=T10]")
        expect(row.locator("output")).to_have_text(f"{6-k}.00 mm")
        expect(row.locator("input")).to_have_count(0)
        row.locator("button").focus()
        expect(by("#measure-label")).to_contain_text(f"{6-k}.00")
        for part in ("cap", "terminal-b"):
            expect(by(f"[data-part={part}]")).to_be_visible()
        shot(f"T10-K03-{k}")
        print(f"PASS live K03={k} T10={6-k} mm", flush=True)

    fixed = save_and_reopen("saved-demo-b.json", "cap")
    assert fixed["product"]["terminalSpec"] == "DEMO-B@1" and "T10" not in fixed["product"]["values"]
    expect(by("[data-measure=T10] output")).to_have_text("3.00 mm")
    assert not errors, errors
    print("PASS fixed terminal spec, K03 and calculated T10 after reload; no page errors")
    browser.close()
