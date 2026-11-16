"""Render the small Nudge mark to PNG/ICO with Python's standard library only.

The geometry and colors mirror public/favicon.svg. Run from the repository root
with python3 scripts/generate-favicons.py after changing the mark.
"""
import struct
import zlib
from pathlib import Path

PUBLIC = Path(__file__).resolve().parent.parent / 'public'


def rounded_rect(x, y, left, top, width, height, radius):
    dx = max(abs(x - left - width / 2) - (width / 2 - radius), 0)
    dy = max(abs(y - top - height / 2) - (height / 2 - radius), 0)
    return dx * dx + dy * dy <= radius * radius


def png(size):
    samples = 4
    raw = bytearray()
    for row in range(size):
        raw.append(0)  # PNG filter: none.
        for column in range(size):
            colors = [0, 0, 0]
            covered = 0
            for sy in range(samples):
                for sx in range(samples):
                    x = (column + (sx + .5) / samples) * 64 / size
                    y = (row + (sy + .5) / samples) * 64 / size
                    if not rounded_rect(x, y, 3.25, 3.25, 57.5, 57.5, 16.75):
                        continue
                    color = (161, 90, 44)
                    if rounded_rect(x, y, 4.75, 4.75, 54.5, 54.5, 15.25):
                        blend = min(1, max(0, (y - 4) / 56))
                        color = tuple(round(a + (b - a) * blend) for a, b in zip((231, 154, 80), (183, 95, 40)))
                    for left, top, height in [(18, 24, 16), (29, 18, 28), (40, 12, 40)]:
                        if rounded_rect(x, y, left, top, 6, height, 3):
                            color = (255, 241, 206)
                    covered += 1
                    for channel in range(3):
                        colors[channel] += color[channel]
            raw.extend(round(value / covered) if covered else 0 for value in colors)
            raw.append(round(255 * covered / samples ** 2))

    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))

    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(bytes(raw), 9)) + chunk(b'IEND', b'')


PUBLIC.mkdir(exist_ok=True)
images = [(size, png(size)) for size in (16, 32, 48)]
offset = 6 + 16 * len(images)
entries = bytearray()
for size, data in images:
    entries.extend(struct.pack('<BBBBHHII', size, size, 0, 0, 1, 32, len(data), offset))
    offset += len(data)
(PUBLIC / 'favicon.ico').write_bytes(struct.pack('<HHH', 0, 1, len(images)) + entries + b''.join(data for _, data in images))
(PUBLIC / 'favicon-32.png').write_bytes(images[1][1])
(PUBLIC / 'apple-touch-icon.png').write_bytes(png(180))
print('Generated 16/32/48 px ICO, 32 px PNG and 180 px touch icon.')
