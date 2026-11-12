"""icons/icon.svg と同じ絵を PNG で作る（Android のホーム画面用）。

使い方（memo-app フォルダで）:
    python tools/make-icons.py
Pillow が必要（pip install pillow）。
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BLUE = (59, 110, 165, 255)
YELLOW = (245, 185, 66, 255)
WHITE = (255, 255, 255, 255)
SS = 4  # 大きく描いてから縮めて、ふちをなめらかにする


def draw(size, maskable):
    s = size * SS / 512  # 512 マスの座標 → 実際のピクセル
    img = Image.new('RGBA', (size * SS, size * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if maskable:
        # 丸や角丸に切り抜かれても欠けないよう、背景は全面・中身は少し小さく
        d.rectangle([0, 0, size * SS, size * SS], fill=BLUE)
        k, off = 0.75, 256 * 0.25
    else:
        d.rounded_rectangle([0, 0, size * SS - 1, size * SS - 1], radius=110 * s, fill=BLUE)
        k, off = 1.0, 0

    def p(v):
        return (v * k + off) * s

    d.rounded_rectangle([p(130), p(100), p(382), p(412)], radius=24 * k * s, fill=WHITE)
    w = 22 * k * s
    for x1, y, x2 in [(180, 180, 332), (180, 250, 332), (180, 320, 270)]:
        d.line([p(x1), p(y), p(x2), p(y)], fill=BLUE, width=round(w))
        for x in (x1, x2):  # 線の端を丸く
            d.ellipse([p(x) - w / 2, p(y) - w / 2, p(x) + w / 2, p(y) + w / 2], fill=BLUE)
    d.ellipse([p(320), p(320), p(424), p(424)], fill=YELLOW)
    return img.resize((size, size), Image.LANCZOS)


for size in (192, 512):
    draw(size, False).save(os.path.join(ROOT, 'icons', f'icon-{size}.png'))
    draw(size, True).save(os.path.join(ROOT, 'icons', f'icon-maskable-{size}.png'))
print('icons/ に PNG を作りました')
