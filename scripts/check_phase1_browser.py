"""Exercise the Phase 1 UI in Chromium and collect comparison images from the app."""
import argparse
import base64
from pathlib import Path
import os
from playwright.sync_api import expect, sync_playwright

STAGES = [
    ("tab_sealed", "탭 실링 후"),
    ("final_sealed", "최종 실링 · 절단 전"),
    ("package_trimmed", "절단 후"),
    ("package_folded", "폴딩 · 완성셀"),
]
PREFIX = "processTooling.sealBars.positive_upper.tabProfile."


def run(page, url, output):
    issues = []
    page.on("pageerror", lambda error: issues.append(str(error)))
    page.set_default_timeout(90_000)
    expect.set_options(timeout=90_000)
    page.goto(url)
    expect(page.get_by_role("heading", name="공정 한눈에 보기")).to_be_visible()
    expect(page.locator("#process-detail")).to_be_hidden()
    expect(page.locator("#overview-model")).to_contain_text("virtual-pouch-phase1 · phase1-1")
    expect(page.locator(".process-card")).to_have_count(13)
    assert page.locator("#process-overview canvas").count() == 0
    expect(page.locator('.process-card[data-state="ready"]')).to_have_count(13, timeout=180_000)
    page.screenshot(path=output / "overview.png", full_page=True, animations="disabled")
    for i, (stage, _) in enumerate(STAGES, 1):
        source = page.locator(f'.process-card[data-stage="{stage}"] img').get_attribute("src")
        (output / f"0{i}-{stage}.png").write_bytes(base64.b64decode(source.split(",", 1)[1]))
    print("Live overview, three groups and 13 fixed thumbnails: PASS", flush=True)

    def stage(value):
        page.locator("#stage").select_option(value)
        expect(page.locator("#stage")).to_have_value(value)
        expect(page.locator("#status")).to_contain_text("CAD 확정")

    def zoom_tab():
        summary = page.locator("#pouch-results-panel summary")
        if not page.locator("#pouch-results-panel").evaluate("(element) => element.open"):
            summary.click()
        page.get_by_role("button", name="양극 탭 실링 확대·치수").click()
        expect(page.get_by_role("img", name="탭측 실링면과 L, R 치수")).to_be_visible()

    def edit(path, value):
        page.locator(f'[data-r4-field="{path}"]').fill(str(value))

    def preview_and_apply():
        page.locator("#r4-preview").click()
        expect(page.locator("#r4-message")).to_contain_text("미리보기 완료")
        page.locator("#r4-apply").click()
        expect(page.locator("#status")).to_contain_text("CAD 확정")

    def measure(name, value):
        expect(page.locator("#r4-results").get_by_role("row").filter(has_text=name)).to_contain_text(value)

    # Select a finished card, confirm the model identity and keep the selection when going back.
    page.locator('.process-card[data-stage="package_folded"]').click()
    expect(page.locator("#scene-title")).to_contain_text("virtual-pouch-phase1 / phase1-1")
    expect(page.locator("#status")).to_contain_text("CAD 확정")
    assert page.locator('#stage option[value="folded"]').evaluate('(option) => option.disabled')
    page.locator("#open-overview").click()
    expect(page.locator('.process-card[data-stage="package_folded"]')).to_have_attribute("aria-current", "true")
    page.locator('.process-card[data-stage="tab_sealed"]').click()
    expect(page.locator("#status")).to_contain_text("CAD 확정")
    zoom_tab()
    measure("제품 중앙 접점 L", "38.000")
    measure("제품 전이 R", "3.000")
    page.locator("#r4-plan").screenshot(path=output / "tab-original.png")
    edit(PREFIX + "centerLength", 42)
    preview_and_apply()
    measure("제품 중앙 접점 L", "42.000")
    measure("제품 전이 R", "3.000")
    page.locator("#r4-plan").screenshot(path=output / "tab-L42.png")
    stage("package_folded")
    measure("제품 중앙 접점 L", "42.000")
    edit(PREFIX + "centerLength", 38)
    edit(PREFIX + "transitionR", 5)
    preview_and_apply()
    measure("제품 중앙 접점 L", "38.000")
    measure("제품 전이 R", "5.000")
    page.locator("#r4-plan").screenshot(path=output / "tab-R5-folded.png")

    # Reject an infeasible edit in the UI and preserve the last confirmed geometry.
    edit(PREFIX + "transitionR", 15)
    page.locator("#r4-preview").click()
    expect(page.locator("#r4-message")).to_contain_text("접선 구간")
    expect(page.locator("#r4-apply")).to_be_disabled()
    page.locator("#r4-cancel").click()
    measure("제품 전이 R", "5.000")

    page.locator("#r4-mode").select_option("pouch")
    edit("processTooling.packaging.cutY", 52)
    preview_and_apply()
    measure("remainingFlange", "12.500")
    zoom_tab()
    page.screenshot(path=output / "folded-tab-detail.png", animations="disabled")

    with page.expect_download() as saved:
        page.locator("#save").click()
    saved_path = output / "tested-project.json"
    saved.value.save_as(saved_path)
    page.locator("#file").set_input_files(saved_path)
    expect(page.locator("#status")).to_contain_text("CAD 확정")
    expect(page.locator("#stage")).to_have_value("package_folded")
    measure("제품 전이 R", "5.000")
    stage("tab_sealed")
    measure("제품 전이 R", "5.000")

    page.locator("#pouch-example").click()
    expect(page.locator("#stage")).to_have_value("sealed")
    expect(page.locator("#status")).to_contain_text("CAD 확정")
    expect(page.locator("#scene-title")).to_contain_text("P2")
    page.locator("#tooling-tab").click()
    page.locator("#r4-example").click()
    expect(page.locator("#stage")).to_have_value("preweld")
    expect(page.locator("#status")).to_contain_text("CAD 확정")
    page.locator("#file").set_input_files(Path("examples/process-tooling-r4.json").resolve())
    expect(page.locator("#status")).to_contain_text("CAD 확정")
    stage("tab_sealed")
    page.locator("#tooling-tab").click()
    page.locator("#r4-mode").select_option("seal")
    page.locator("#r4-location").select_option("positive")
    expect(page.locator('[data-r4-field$=".vertices.1.arc"]')).to_be_visible()
    assert not issues, issues
    print("Linked stage details/return, L and R, rejection, cut, JSON, legacy P and R4: PASS", flush=True)


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("url")
    cli.add_argument("output", type=Path)
    args = cli.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        with p.chromium.launch(executable_path=os.getenv("POUCH_CHROMIUM")) as browser:
            page = browser.new_page(viewport={"width": 1440, "height": 1000})
            run(page, args.url, args.output)


if __name__ == "__main__":
    main()
