"""Exercise the review in a built app. Accepts live CAD or a static preview URL.

Use --touch for a 1194 × 834 iPad landscape viewport with touch input in Chromium.
Use --output to write the actual observed route, state and screen evidence.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


STAGES = (
    "stacked", "gathered", "preweld", "welded", "assembly", "film_formed",
    "assembly_loaded_open", "package_closed", "tab_sealed", "gas_sealed",
    "final_sealed", "package_trimmed", "package_folded",
)
PROFILE = "processTooling.sealBars.positive_upper.tabProfile."


class Review:
    def __init__(self, page, mode, touch, output):
        self.page = page
        self.live = mode == "live"
        self.touch = touch
        self.output = output
        self.label = mode + ("-touch" if touch else "-mouse")
        self.events = []
        self.errors = []
        self.posts = []
        page.on("pageerror", lambda error: self.errors.append(str(error)))
        page.on("request", lambda req: self.posts.append(req.url) if req.method == "POST" else None)
        self.el = page.locator

    def note(self, observation, **properties):
        print(observation, flush=True)
        self.events.append({"observation": observation, **properties})
        path = self.output / f"{self.label}.json"
        path.write_text(json.dumps(self.events, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    def press(self, selector):
        button = self.el(selector)
        if self.touch:
            button.tap()
        else:
            button.click()

    def shot(self, name):
        self.page.screenshot(path=self.output / f"{self.label}-{name}.png", animations="disabled")

    def accepted(self, stage):
        expect(self.el("#stage")).to_have_value(stage)
        expect(self.el("#status")).to_contain_text(("CAD 확정" if self.live else "기록 확정") + " ·")

    def stage(self, id):
        button = self.el(f'[data-process="{id}"]')
        if not button.is_visible():
            group = button.locator("xpath=ancestor::details[1]")
            if not group.evaluate("group => group.open"):
                group.locator("summary").click()
        self.press(f'[data-process="{id}"]')
        self.accepted(id)

    def cards(self):
        cards = self.el(".process-card")
        expect(self.el('.process-card[data-state="ready"]')).to_have_count(13, timeout=360_000)
        sources = cards.evaluate_all(
            "(cards) => cards.map(card => [card.dataset.stage, card.querySelector('img').src])"
        )
        assert tuple(s for s, _ in sources) == STAGES, [s for s, _ in sources]
        assert all(src.startswith("data:image/") for _, src in sources)
        return {stage: hashlib.sha256(src.encode()).hexdigest() for stage, src in sources}

    def route(self):
        expect(self.el("#process-overview")).to_be_visible()
        expect(self.el("#process-detail")).to_be_hidden()
        expect(self.el("#overview-model")).to_contain_text("phase1-1")
        cards = self.cards()
        self.shot("overview")
        self.note("Representative model overview and ordered CAD cards", stages=list(cards), engine=self.el("#overview-engine").inner_text(), viewport=self.page.viewport_size)
        self.press('.process-card[data-stage="preweld"]')
        self.accepted("preweld")
        expect(self.el("#scene-title")).to_contain_text("phase1-1")
        ids = self.el("[data-process]").evaluate_all("(buttons) => buttons.map(b => b.dataset.process)")
        assert tuple(ids) == STAGES, ids
        self.press("#open-seal")
        expect(self.el("#r4-plan svg")).to_be_visible(timeout=180_000)
        expect(self.el(f'[data-r4-field="{PROFILE}centerLength"]')).to_have_value("38")
        expect(self.el(f'[data-r4-field="{PROFILE}transitionR"]')).to_have_value("3")
        status = self.el("#application-state").inner_text()
        assert "적용 전" in status, status
        if self.live:
            expect(self.el(f'[data-r4-field="{PROFILE}transitionR"]')).to_be_enabled()
        else:
            expect(self.el(f'[data-r4-field="{PROFILE}transitionR"]')).to_be_disabled()
            for id in ["r4-preview", "r4-apply", "save", "step", "models"]:
                expect(self.el("#" + id)).to_be_disabled()
        self.shot("seal-at-s2")
        self.press("#page-product")
        self.accepted("preweld")
        expect(self.el("#scene-title")).to_contain_text("phase1-1")
        self.press("#page-overview")
        assert cards == self.cards(), "Process images changed after a route change"
        expect(self.el('.process-card[data-stage="preweld"]')).to_have_attribute("aria-current", "true")
        self.press("#page-parts")
        expect(self.el("#r4-plan svg")).to_be_visible()
        self.press("#page-overview")
        expect(self.el('[data-component="seal"]')).to_be_visible()
        components = self.el("[data-component]").evaluate_all("(buttons) => buttons.map(b => b.dataset.component)")
        assert components == [
            "tab", "lead", "leadFilm", "tapes", "pouch", "gathering", "preweld", "welded", "laser", "seal",
        ], components
        self.press('[data-component="seal"]')
        expect(self.el("#r4-plan svg")).to_be_visible()
        self.press("#page-product")
        expect(self.el("#process-overview")).to_be_visible()
        self.note("S2 → seal design → same S2 and original product cards, independent page memory",
                  model=self.el("#overview-model").inner_text(), application=status,
                  components=components, card_sha256=cards)
        return cards

    def expanded(self, group):
        toggle = self.el(f'[data-expand="{group}"]')
        if toggle.get_attribute("aria-expanded") != "true":
            self.press(f'[data-expand="{group}"]')

    def visible_parts(self):
        return self.el("[data-eye]").evaluate_all(
            "(buttons) => Object.fromEntries(buttons.map(b => [b.dataset.eye, b.getAttribute('aria-pressed')]))"
        )

    def catalog(self):
        self.press("#page-parts")
        results = {}
        for key in ["tab", "lead", "leadFilm", "tapes", "pouch", "preweld", "welded", "laser", "gathering", "seal"]:
            self.el("#component-choice").select_option(key)
            self.accepted("preweld")
            basic = key in {"tab", "lead", "leadFilm", "tapes"}
            if basic:
                expect(self.el("#component-drawing img").first).to_be_visible(timeout=120_000)
                fields = self.el("#component-host [data-field]")
            else:
                fields = self.el("#component-host [data-r4-field]")
                if key == "pouch":
                    expect(self.el("#component-drawing canvas")).to_be_visible(timeout=120_000)
                    for suffix in [".depth", ".rimR", ".floorR", ".cutY"]:
                        assert self.el(f'#r4-fields [data-r4-field$="{suffix}"]').count() >= 1, suffix
                elif key == "gathering":
                    expect(self.el("#r4-plan img" if not self.live else "#r4-plan svg")).to_be_visible(timeout=120_000)
                else:
                    expect(self.el("#r4-plan svg").first).to_be_visible(timeout=120_000)
                if key == "laser":
                    expect(self.el("#r4-results")).to_contain_text("레이저 접합 기록 없음")
                if key in {"preweld", "welded"}:
                    for kind in ["anvil", "horn"]:
                        self.el("#r4-kind").select_option(kind)
                        expect(self.el("#r4-results")).to_contain_text(kind + " 공칭 접촉 면적")
            assert fields.count(), key
            if not self.live:
                assert fields.evaluate_all("(elements) => elements.every(field => field.disabled)")
            status = self.el("#application-state").inner_text()
            if key in {"lead", "leadFilm", "tapes"}:
                assert "해당 공정에 부품 없음" in status, status
            results[key] = {"fields": fields.count(), "state": status}
        self.press("#page-product")
        expect(self.el("#process-overview")).to_be_visible()
        self.note("All ten component entries inspected on S2, both horn and anvil work faces and inactive laser", components=results)

    def group_visibility(self):
        self.press('.process-card[data-stage="assembly"]')
        self.accepted("assembly")
        for group in ("positive", "negative", "tool"):
            self.expanded(group)
        baseline = self.visible_parts()
        sealant = "positive.leadFilm"
        assert baseline[sealant] == "true"
        assert baseline["positive.tape.yellow"] == "true"
        self.press(f'[data-eye="{sealant}"]')
        previous = self.visible_parts()
        assert previous == {**baseline, sealant: "false"}, (baseline, previous)
        self.press('[data-group="positive"]')
        self.press('[data-group-eye="positive"]')
        hidden = self.visible_parts()
        for key in ["positive.tab", "positive.lead", "positive.joint.main", "positive.tape.yellow", sealant]:
            assert hidden[key] == "false", key
        others = [id for id in baseline if id.startswith(("negative.", "tool."))]
        assert any(id.startswith("tool.") for id in others)
        assert all(hidden[id] == baseline[id] for id in others)
        self.press('[data-group-eye="positive"]')
        assert self.visible_parts() == previous
        self.press(f'[data-eye="{sealant}"]')
        assert self.visible_parts() == baseline
        self.note("S4 positive group visibility restores pre-hidden sealant; negative and tools unchanged",
                  group_hidden=sorted(key for key in hidden if hidden[key] == "false"),
                  independent=others)

    def owners(self):
        guides = {}
        for part, path, value in [
            ("positive.tab", "positive.tab.gatherDistance", "10"),
            ("positive.lead", "positive.lead.width", "36"),
            ("positive.leadFilm", "positive.leadFilm.overhang", "2"),
        ]:
            self.press(f'[data-part="{part}"]')
            field = self.el(f'[data-field="{path}"]')
            assert field.count() == 0
            self.press(f'[data-owner-path="{path}"]')
            expect(field).to_be_visible()
            expect(field).to_have_value(value)
            if self.live:
                expect(field).to_be_enabled()
            else:
                expect(field).to_be_disabled()
            guides[path] = self.el("#field-guide").inner_text()
            assert path in guides[path] and "방향" in guides[path], guides[path]
            expect(self.el('#viewport .model-overlay circle[fill="#167d86"]')).to_have_count(2)
            self.press("#page-product")
            self.accepted("assembly")
        self.note("Single field owner opens from product references; direction and endpoints shown", guides=guides)

    def selection(self):
        self.stage("package_closed")
        self.expanded("positive")
        expect(self.el("#transparent")).not_to_be_checked()
        self.press('[data-view="front"]')
        # These three CAD datum axis segments record both camera orientation and scale.
        axis_lines = self.el('#viewport .model-overlay line:is([stroke="#d98763"],[stroke="#6f9b84"],[stroke="#718ac5"])')
        expect(axis_lines).to_have_count(3)
        axes = lambda: axis_lines.evaluate_all("(lines) => lines.map(line => ['x1','y1','x2','y2'].map(k => line.getAttribute(k)))")
        before = axes()
        self.press('[data-part="positive.leadFilm"]')
        expect(self.el("#selection-info")).to_contain_text("실런트")
        expect(self.el("#viewport [data-selection-outline]").first).to_be_visible()
        assert before == axes(), "Selecting the buried sealant changed the camera"
        expect(self.el("#transparent")).not_to_be_checked()
        self.shot("occluded-sealant")
        # Touch a different, visible mesh directly at product center, reopening its closed group.
        self.expanded("pouch")
        self.press('[data-expand="pouch"]')
        canvas = self.el("#viewport canvas").first
        canvas.scroll_into_view_if_needed()
        point = canvas.bounding_box()
        center = {"x": point["width"] / 2, "y": point["height"] / 2}
        if self.touch:
            canvas.tap(position=center)
        else:
            canvas.hover(position=center)
            expect(self.el("#hover-tip")).to_be_visible()
            canvas.click(position=center)
        expect(self.el('[data-expand="pouch"]')).to_have_attribute("aria-expanded", "true")
        name = self.el("#selection-info").inner_text()
        assert "실런트" not in name and name.strip(), name
        self.note("Opaque R2 sealant outlined; camera axis projections unchanged. 3D hit opens pouch group",
                  hit_name=name, projection=before, input_method="touch tap" if self.touch else "hover and click")

    def seal_result(self):
        statuses = {}
        for stage in ["tab_sealed", "final_sealed", "package_trimmed", "package_folded"]:
            self.stage(stage)
            self.press("#open-seal")
            expect(self.el("#r4-plan svg")).to_be_visible()
            statuses[stage] = self.el("#application-state").inner_text()
            assert "적용 전" not in statuses[stage], statuses
            self.press("#page-product")
        assert len(set(statuses.values())) >= 3, statuses
        self.note("Seal product result tracks pre-cut, trimmed and folded stages", statuses=statuses)

    def model_picker(self):
        self.press("#choose-model")
        choices = self.el("#model-choices [data-model]")
        expect(choices).to_have_count(4)
        picker_ids = choices.evaluate_all("(choices) => choices.map(button => button.dataset.model)")
        assert set(picker_ids) == {"demo", "pouch-phase1", "pouch-process", "process-tooling-r4"}
        images = self.el("#model-choices img")
        expect(images).to_have_count(4)
        self.page.wait_for_function("Array.from(document.querySelectorAll('#model-choices img')).every(img => img.complete && img.naturalWidth > 0)")
        for key, current, expected in [
            ("pouch-process", "virtual-pouch-v15", "sealed"),
            ("process-tooling-r4", "virtual-process-tooling-r4", "preweld"),
        ]:
            self.press(f'[data-model="{key}"]')
            expect(self.el("#current-model")).to_contain_text(current)
            self.press("#page-product")
            self.press("#page-overview")
            if key == "pouch-process":
                assert self.el('.process-card[data-stage="film_formed"]').count() == 0
            self.press(f'.process-card[data-stage="{expected}"]')
            self.accepted(expected)
            if key == "pouch-process":
                self.press("#choose-model")
            else:
                self.press("#open-seal")
                expect(self.el('#r4-special [data-r4-field$=".vertices.1.arc"]')).to_be_visible()
                assert "꼭짓점" in self.el("#r4-basis").inner_text()
        self.note("Four model pictures; legacy P route and original vertex-defined R4 seal", models=picker_ids)

    def edit_owner(self, part, field_name, before, after):
        path = f"positive.{part}.{field_name}"
        self.expanded("positive")
        self.press(f'[data-part="positive.{part}"]')
        self.press(f'[data-owner-path="{path}"]')
        field = self.el(f'[data-field="{path}"]')
        expect(field).to_have_value(str(before))
        def matches(response):
            if not response.url.endswith("/api/rebuild"):
                return False
            project = response.request.post_data_json["project"]
            return project["stage"] == "assembly" and project["product"]["positive"][part][field_name] == after
        with self.page.expect_response(matches, timeout=120_000) as event:
            field.fill(str(after))
        response = event.value
        assert response.ok, response.text()
        result = response.json()
        assert result["mode"] == "live-cad"
        self.accepted("assembly")
        expect(field).to_have_value(str(after))
        self.press("#page-product")
        return result["features"]

    def live_owners(self):
        # Keep the active model and use three separate single-field edits and undo actions.
        self.press("#page-product")
        self.stage("assembly")
        before_after = {}
        for part, field, before, after, expected in [
            ("tab", "gatherDistance", 10, 11, [-131, 36, 40]),
            ("lead", "width", 36, 37.5, [-130, 37.5, 41.5]),
            ("leadFilm", "overhang", 2, 2.5, [-130, 36, 41]),
        ]:
            data = self.edit_owner(part, field, before, after)
            def signature(side):
                def point(key):
                    return data[f"{side}.{key}"]["point"]
                def width(part):
                    return round(point(part + ".widthPlus")[1] - point(part + ".widthMinus")[1], 5)
                return [round(point("tab.gather")[0], 5), width("lead"), width("leadFilm")]
            actual = signature("positive")
            negative = signature("negative")
            assert actual == expected, (part, field, actual)
            assert negative == [129, 34, 37], negative
            before_after[f"{part}.{field}"] = {"input_mm": [before, after], "gatherX_leadWidth_sealantWidth_mm": actual, "negative_mm": negative}
            self.press("#undo")
            self.accepted("assembly")
            self.page.wait_for_function("!document.querySelector('#choose-model').disabled")
        self.note("Three live single-owner edits via product references; opposite CAD pole invariant", results=before_after)

    def seal_edit(self):
        self.press('.process-card[data-stage="tab_sealed"]')
        self.accepted("tab_sealed")
        self.press("#open-seal")
        radius = self.el(f'[data-r4-field="{PROFILE}transitionR"]')
        verify = lambda value: expect(self.el("#r4-results").get_by_role("row").filter(has_text="제품 전이 R")).to_contain_text(value)
        verify("3.000")
        radius.fill("5")
        self.press("#r4-preview")
        expect(self.el("#r4-message")).to_contain_text("미리보기 완료", timeout=120_000)
        self.press("#r4-apply")
        self.accepted("tab_sealed")
        verify("5.000")
        radius.fill("15")
        self.press("#r4-preview")
        expect(self.el("#r4-message")).to_contain_text("접선 구간", timeout=120_000)
        expect(self.el("#r4-apply")).to_be_disabled()
        self.press("#r4-cancel")
        verify("5.000")
        self.note("Live R3 tool edit and refusal", accepted_radius_mm=5, rejected_radius_mm=15,
                  confirmed_after_rejection_mm=5)

    def run(self, url):
        self.page.goto(url)
        cards = self.route()
        self.catalog()
        self.group_visibility()
        self.owners()
        self.selection()
        self.seal_result()
        self.press("#page-overview")
        assert cards == self.cards()
        if self.live:
            self.seal_edit()
            self.live_owners()
        self.model_picker()
        assert not self.errors, self.errors
        if not self.live:
            assert not self.posts, self.posts
        self.note("Final overview stable; JavaScript exceptions checked", exceptions=self.errors,
                  api_posts=len(self.posts))


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("url")
    cli.add_argument("--mode", choices=("live", "preview"), required=True)
    cli.add_argument("--touch", action="store_true")
    cli.add_argument("--output", type=Path, required=True)
    args = cli.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        with pw.chromium.launch(executable_path=os.getenv("POUCH_CHROMIUM")) as browser:
            options = (dict(pw.devices["iPad Pro 11 landscape"]) if args.touch
                       else {"viewport": {"width": 1440, "height": 1000}})
            options.pop("default_browser_type", None)
            options["device_scale_factor"] = 1
            page = browser.new_page(**options)
            page.set_default_timeout(20_000)
            expect.set_options(timeout=40_000)
            print(browser.version, options["viewport"], flush=True)
            review = Review(page, args.mode, args.touch, args.output)
            try:
                review.run(args.url)
            except Exception:
                review.shot("failure")
                raise


if __name__ == "__main__":
    main()
