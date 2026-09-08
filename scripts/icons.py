"""Generate local, mask-safe PWA icons. Requires Pillow only to regenerate."""
from pathlib import Path
from PIL import Image, ImageDraw
import math

root = Path(__file__).resolve().parent.parent / 'public' / 'icons'
root.mkdir(parents=True, exist_ok=True)
for size in [192, 512]:
    scale = size * 3 / 100
    image = Image.new('RGB', (size * 3, size * 3), '#111b18')
    draw = ImageDraw.Draw(image)
    points = [(69, 29), (42, 29)]
    points += [(42 + 12 * math.cos(t), 41 + 12 * math.sin(t)) for t in [math.radians(-90 - i * 180 / 50) for i in range(51)]]
    points += [(58, 53)]
    points += [(58 + 12 * math.cos(t), 65 + 12 * math.sin(t)) for t in [math.radians(-90 + i * 180 / 50) for i in range(51)]]
    points += [(31, 77)]
    draw.line([(round(x * scale), round(y * scale)) for x, y in points], fill='#c2f970', width=round(12 * scale), joint='curve')
    for x, y in [points[0], points[-1]]:
        draw.ellipse(((x-6)*scale, (y-6)*scale, (x+6)*scale, (y+6)*scale), fill='#c2f970')
    draw.ellipse((65*scale, 25*scale, 69*scale, 29*scale), fill='#111b18')
    image.resize((size, size), Image.Resampling.LANCZOS).save(root / f'icon-{size}.png')
