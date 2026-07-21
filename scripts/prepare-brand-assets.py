"""Prepare transparent VERAH product assets from the approved raster sources.

The script does not redraw the mark. It reconstructs transparency from the
known solid backgrounds, separates the existing symbol/wordmark/signature
regions, and trims unused margins.
"""

from pathlib import Path
from shutil import copyfile

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
BRAND = ROOT / "public" / "brand"

SOURCE_CONFIG = {
    "light": {
        "file": BRAND / "logo-dark.png",
        "background": (43, 43, 43),
        "main_colors": [
            (255, 255, 255),
            (242, 214, 216),
            (232, 180, 184),
            (195, 153, 156),
            (198, 198, 198),
        ],
        "detail_colors": [
            (232, 180, 184),
            (195, 153, 156),
            (102, 102, 102),
            (198, 198, 198),
        ],
    },
    "dark": {
        "file": BRAND / "logo-light.png",
        "background": (255, 255, 255),
        "main_colors": [
            (43, 43, 43),
            (232, 180, 184),
            (237, 195, 198),
        ],
        "detail_colors": [
            (232, 180, 184),
            (237, 195, 198),
            (187, 187, 187),
            (100, 100, 100),
        ],
    },
}


def color_to_alpha(
    pixels: np.ndarray,
    background: tuple[int, int, int],
    target_colors: list[tuple[int, int, int]],
) -> np.ndarray:
    """Recover foreground color and alpha from a flat background composite."""
    observed = pixels.astype(np.float32)
    bg = np.asarray(background, dtype=np.float32)
    best_error = np.full(observed.shape[:2], np.inf, dtype=np.float32)
    best_alpha = np.zeros(observed.shape[:2], dtype=np.float32)
    best_color = np.zeros_like(observed)

    for target_tuple in target_colors:
        target = np.asarray(target_tuple, dtype=np.float32)
        vector = target - bg
        denominator = float(np.dot(vector, vector))
        if denominator == 0:
            continue
        alpha = np.clip(np.sum((observed - bg) * vector, axis=2) / denominator, 0, 1)
        predicted = bg + alpha[..., None] * vector
        error = np.sum((observed - predicted) ** 2, axis=2)
        replace = (error < best_error - 0.01) | (
            (np.abs(error - best_error) <= 0.01) & (alpha > best_alpha)
        )
        best_error[replace] = error[replace]
        best_alpha[replace] = alpha[replace]
        best_color[replace] = target

    distance = np.max(np.abs(observed - bg), axis=2)
    best_alpha[(distance <= 1) | (best_alpha < 0.015)] = 0
    output = np.dstack(
        (
            np.clip(best_color, 0, 255).astype(np.uint8),
            np.clip(np.rint(best_alpha * 255), 0, 255).astype(np.uint8),
        )
    )
    output[output[..., 3] == 0, :3] = 0
    return output


def trim(image: Image.Image, padding: int = 4) -> Image.Image:
    alpha = np.asarray(image.getchannel("A"))
    ys, xs = np.nonzero(alpha)
    if not len(xs):
        raise ValueError("The prepared asset is empty.")
    left = max(int(xs.min()) - padding, 0)
    top = max(int(ys.min()) - padding, 0)
    right = min(int(xs.max()) + padding + 1, image.width)
    bottom = min(int(ys.max()) + padding + 1, image.height)
    return image.crop((left, top, right, bottom))


def square_icon(image: Image.Image, size: int = 512) -> Image.Image:
    margin = round(size * 0.06)
    available = size - margin * 2
    scale = min(available / image.width, available / image.height)
    resized = image.resize(
        (round(image.width * scale), round(image.height * scale)),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(
        resized,
        ((size - resized.width) // 2, (size - resized.height) // 2),
    )
    return canvas


def prepare_variant(tone: str) -> dict[str, Image.Image]:
    config = SOURCE_CONFIG[tone]
    source = Image.open(config["file"]).convert("RGB")
    pixels = np.asarray(source)
    height, width = pixels.shape[:2]
    yy, xx = np.mgrid[:height, :width]

    # The supplied signature begins its divider/tagline to the right of the
    # symbol and below the main wordmark. Regions are selected, never redrawn.
    main_region = (xx < 340) | (yy < 245)
    prepared = np.zeros((height, width, 4), dtype=np.uint8)
    main = color_to_alpha(
        pixels,
        config["background"],
        config["main_colors"],
    )
    detail = color_to_alpha(
        pixels,
        config["background"],
        config["detail_colors"],
    )
    prepared[main_region] = main[main_region]
    prepared[~main_region] = detail[~main_region]
    signature = Image.fromarray(prepared, "RGBA")

    symbol_array = prepared.copy()
    symbol_array[:, 340:] = 0

    wordmark_array = prepared.copy()
    wordmark_array[(xx >= 340) & (yy >= 245)] = 0

    return {
        "symbol": trim(Image.fromarray(symbol_array, "RGBA")),
        "wordmark": trim(Image.fromarray(wordmark_array, "RGBA")),
        "signature": trim(signature),
    }


def main() -> None:
    prepared: dict[str, dict[str, Image.Image]] = {}
    for tone in ("light", "dark"):
        prepared[tone] = prepare_variant(tone)
        for kind, image in prepared[tone].items():
            destination = BRAND / f"verah-{kind}-{tone}.png"
            image.save(destination, optimize=True)
            print(f"created {destination.relative_to(ROOT)} {image.size}")

    app_icon = square_icon(prepared["dark"]["symbol"])
    app_icon.save(ROOT / "app" / "icon.png", optimize=True)
    copyfile(ROOT / "app" / "icon.png", ROOT / "app" / "apple-icon.png")
    print("updated app/icon.png and app/apple-icon.png from verah-symbol-dark.png")


if __name__ == "__main__":
    main()
