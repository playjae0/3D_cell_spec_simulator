"""Capture the app's fixed CAD process images at native size from a running app."""
import argparse
import base64
import io
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import expect, sync_playwright

STAGES = [
    ("package_closed", "R2  브리지 닫힘 · 실링 전"),
    ("tab_sealed", "R3  탭측 실링 · 가스측 개구"),
    ("gas_sealed", "R4  가스방 외곽 실링"),
    ("final_sealed", "R5  최종 실링 · 절단 전"),
    ("package_trimmed", "R6  절단 후"),
    ("package_folded", "R7  폴딩 · 완성셀"),
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("url", help="URL of the live app or recorded preview")
    parser.add_argument("output", type=Path)
    parser.add_argument("--font", default="/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc")
    args = parser.parse_args()
    with sync_playwright() as playwright:
        with playwright.chromium.launch(executable_path=os.environ.get("POUCH_CHROMIUM")) as browser:
            page = browser.new_page(viewport={"width": 1500, "height": 1024})
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(args.url)
            cards = page.locator(".process-card[data-state=ready]")
            expect(cards).to_have_count(13, timeout=240_000)
            images = []
            for stage, label in STAGES:
                uri = page.locator(f'.process-card[data-stage="{stage}"] img').get_attribute("src")
                data = base64.b64decode(uri.split(",", 1)[1], validate=True)
                source = Image.open(io.BytesIO(data)).convert("RGB")
                assert source.size == (624, 250), (stage, source.size)
                images.append((label, source))
            assert not errors, errors

    margin, label_height, gap = 16, 40, 12
    w, h = images[0][1].size
    sheet = Image.new("RGB", (w * 2 + gap + margin * 2, (h + label_height + gap) * 3 + margin * 2 - gap), "white")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.truetype(args.font, 22)
    for i, (label, source) in enumerate(images):
        x = margin + (i % 2) * (w + gap)
        y = margin + (i // 2) * (h + label_height + gap)
        draw.text((x, y), label, font=font, fill="#20364a")
        sheet.paste(source, (x, y + label_height))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(args.output, optimize=True)
    print(args.output)


if __name__ == "__main__":
    main()
