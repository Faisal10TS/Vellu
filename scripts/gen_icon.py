"""Generate Vellu app icons with a geometrically-centered V."""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

BG = (13, 11, 10, 255)        # #0d0b0a
FG = (201, 169, 110, 255)     # #c9a96e
RADIUS_RATIO = 96 / 512

FONT_CANDIDATES = [
    "C:/Windows/Fonts/georgia.ttf",
    "C:/Windows/Fonts/Georgia.ttf",
    "C:/Windows/Fonts/times.ttf",
]

def find_font(size):
    for p in FONT_CANDIDATES:
        if Path(p).exists():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

def rounded_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return m

def render_icon(size, out_path):
    font_size = int(size * 0.78)
    font = find_font(font_size)

    tmp = Image.new("RGBA", (size * 2, size * 2), (0, 0, 0, 0))
    td = ImageDraw.Draw(tmp)
    # Draw V at origin then measure tight bbox
    td.text((size, size), "V", fill=FG, font=font)
    bbox = tmp.getbbox()
    gw = bbox[2] - bbox[0]
    gh = bbox[3] - bbox[1]

    # Center the glyph in the icon
    gx = (size - gw) // 2 - bbox[0] + size
    gy = (size - gh) // 2 - bbox[1] + size
    # Shift the tmp image so the V sits centered
    cropped = tmp.crop(bbox)

    canvas = Image.new("RGBA", (size, size), BG)
    # paste position
    cx = (size - gw) // 2
    cy = (size - gh) // 2
    canvas.paste(cropped, (cx, cy), cropped)

    # Apply rounded corners
    mask = rounded_mask(size, int(size * RADIUS_RATIO))
    rounded = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    rounded.paste(canvas, (0, 0), mask)
    rounded.save(out_path, "PNG")
    print(f"wrote {out_path}  V bbox={bbox} size={gw}x{gh}")

root = Path(__file__).resolve().parents[1]
for size, name in [(192, "icon-192.png"), (512, "icon-512.png")]:
    render_icon(size, root / "public" / name)
