#!/usr/bin/env python3
import cv2
import numpy as np
import json
import os
import sys
import argparse
from pathlib import Path

# (R, G, B) -> part_name, derived from rocky split.svg fill values
PART_COLORS = {
    (224, 161, 46):  'leg2_main',        # #e0a12e
    (168, 116, 31):  'leg2_foot',        # #a8741f
    (122, 31,  43):  'leg3_main',        # #7a1f2b
    (82,  21,  32):  'leg3_foot',        # #521520
    (224, 138, 46):  'leg3_foot_small',  # #e08a2e
    (188, 59,  12):  'leg1_main',        # #bc3b0c
    (143, 42,   5):  'leg1_foot',        # #8f2a05
    (138, 85,  38):  'back_1',           # #8a5526
    (79,  46,  20):  'back_2',           # #4f2e14
    (122, 59,  34):  'back_3',           # #7a3b22
    (107, 64,  27):  'body_main',        # #6b401b
    (94,  52,  27):  'hand2_foot',       # #5e341b
    (140, 79,  42):  'hand2_main',       # #8c4f2a
    (168, 100, 31):  'hand1_foot',       # #a8641f
    (217, 138, 43):  'hand1_main',       # #d98a2b
}


def build_nearest_color_map(mask_bgr: np.ndarray, tolerance: int) -> np.ndarray:
    colors = list(PART_COLORS.keys())
    color_arr = np.array(colors, dtype=np.int32)
    mask_rgb = cv2.cvtColor(mask_bgr, cv2.COLOR_BGR2RGB).astype(np.int32)
    H, W = mask_bgr.shape[:2]
    pixels = mask_rgb.reshape(-1, 3)

    diffs = pixels[:, np.newaxis, :] - color_arr[np.newaxis, :, :]
    dist_sq = np.sum(diffs ** 2, axis=2)
    nearest = np.argmin(dist_sq, axis=1)
    min_dist_sq = dist_sq[np.arange(len(pixels)), nearest]

    threshold_sq = int((tolerance * 1.733) ** 2)  # (tol * sqrt(3))^2
    assigned = np.where(min_dist_sq <= threshold_sq, nearest, -1)
    return assigned.reshape(H, W)


def get_part_mask(color_map: np.ndarray, color_index: int) -> np.ndarray:
    return np.where(color_map == color_index, np.uint8(255), np.uint8(0))


def detect_present_parts(mask_bgr: np.ndarray, tolerance: int) -> tuple:
    colors = list(PART_COLORS.keys())
    color_map = build_nearest_color_map(mask_bgr, tolerance)
    present = {}
    for i, (rgb, part) in enumerate(PART_COLORS.items()):
        if np.sum(color_map == i) >= 100:
            present[rgb] = part
    return present, color_map


def extract_part(
    skin_bgr: np.ndarray,
    color_map: np.ndarray,
    color_index: int,
    pad: int = 6,
) -> tuple:
    color_region = get_part_mask(color_map, color_index)

    # Morphological close to fill small gaps from compression artifacts
    kernel = np.ones((5, 5), np.uint8)
    color_region = cv2.morphologyEx(color_region, cv2.MORPH_CLOSE, kernel)

    gray = cv2.cvtColor(skin_bgr, cv2.COLOR_BGR2GRAY)
    _, skin_content = cv2.threshold(gray, 240, 255, cv2.THRESH_BINARY_INV)
    combined = cv2.bitwise_and(skin_content, color_region)

    contours, _ = cv2.findContours(combined, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None, None
    main_cnt = max(contours, key=cv2.contourArea)
    if cv2.contourArea(main_cnt) < 50:
        return None, None

    full_mask = np.zeros(skin_bgr.shape[:2], dtype=np.uint8)
    cv2.drawContours(full_mask, [main_cnt], -1, 255, -1)

    x, y, w, h = cv2.boundingRect(main_cnt)
    x1 = max(0, x - pad)
    y1 = max(0, y - pad)
    x2 = min(skin_bgr.shape[1], x + w + pad)
    y2 = min(skin_bgr.shape[0], y + h + pad)

    cropped_skin = skin_bgr[y1:y2, x1:x2].copy()
    cropped_mask = full_mask[y1:y2, x1:x2]

    rgba = cv2.cvtColor(cropped_skin, cv2.COLOR_BGR2BGRA)
    rgba[:, :, 3] = cropped_mask

    bbox = {'x': x1, 'y': y1, 'width': x2 - x1, 'height': y2 - y1}
    return rgba, bbox


def update_skins_json(skins_json_path: Path, skin_id: str, skin_display_name: str):
    skins_json_path.parent.mkdir(parents=True, exist_ok=True)
    existing = []
    if skins_json_path.exists():
        with open(skins_json_path) as f:
            existing = json.load(f)
    if not any(s['id'] == skin_id for s in existing):
        existing.append({'id': skin_id, 'name': skin_display_name})
        with open(skins_json_path, 'w') as f:
            json.dump(existing, f, indent=2)
        print(f"Added '{skin_id}' to {skins_json_path.name}")
    else:
        print(f"Skin '{skin_id}' already in {skins_json_path.name}")


def main():
    parser = argparse.ArgumentParser(description='Split a skin image into individual body part PNGs')
    parser.add_argument('skin_image', help='Path to the skin image PNG/JPG')
    parser.add_argument('--mask', default='New Project.png', help='Color mask image (default: New Project.png)')
    parser.add_argument('--output', default=None, help='Output directory (default: ../public/skins/<name>/)')
    parser.add_argument('--name', default=None, help='Skin ID used as folder name (default: from filename)')
    parser.add_argument('--tolerance', type=int, default=18, help='Color match tolerance 0-255 (default: 18)')
    args = parser.parse_args()

    script_dir = Path(__file__).parent.resolve()
    skin_path = Path(args.skin_image)
    if not skin_path.is_absolute():
        skin_path = script_dir / skin_path

    if args.name:
        skin_id = args.name.lower().replace(' ', '_')
        display_name = args.name
    else:
        skin_id = skin_path.stem.lower().replace(' ', '_')
        display_name = skin_path.stem

    if args.output:
        output_dir = Path(args.output)
    else:
        output_dir = script_dir.parent / 'public' / 'skins' / skin_id
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Skin ID       : {skin_id}")
    print(f"Output folder : {output_dir}")

    print(f"\nLoading skin  : {skin_path}")
    skin_bgr = cv2.imread(str(skin_path))
    if skin_bgr is None:
        print(f"ERROR: Could not load '{skin_path}'")
        sys.exit(1)
    print(f"  Size: {skin_bgr.shape[1]}x{skin_bgr.shape[0]}")

    mask_path = script_dir / args.mask
    if not mask_path.exists():
        print(f"ERROR: Mask not found at '{mask_path}'")
        print("  Provide --mask <path> to specify the color mask image.")
        sys.exit(1)
    print(f"Loading mask  : {mask_path}")
    mask_bgr = cv2.imread(str(mask_path))
    if mask_bgr is None:
        print(f"ERROR: Could not load mask '{mask_path}'")
        sys.exit(1)

    if mask_bgr.shape[:2] != skin_bgr.shape[:2]:
        print(f"  Resizing mask {mask_bgr.shape[1]}x{mask_bgr.shape[0]} -> {skin_bgr.shape[1]}x{skin_bgr.shape[0]}")
        mask_bgr = cv2.resize(mask_bgr, (skin_bgr.shape[1], skin_bgr.shape[0]), interpolation=cv2.INTER_NEAREST)

    print(f"\nDetecting parts (tolerance={args.tolerance}, nearest-color)...")
    found, color_map = detect_present_parts(mask_bgr, args.tolerance)
    if not found:
        print("ERROR: No known part colors found in the mask image.")
        print("  Check that the mask uses the same colors as 'rocky split.svg'.")
        sys.exit(1)
    print(f"  Found {len(found)} parts: {', '.join(sorted(found.values()))}")

    colors = list(PART_COLORS.keys())

    manifest = {}
    print(f"\nExtracting parts to {output_dir}/")
    for rgb, part_name in sorted(found.items(), key=lambda kv: kv[1]):
        sys.stdout.write(f"  {part_name:<20} ... ")
        sys.stdout.flush()
        color_index = colors.index(rgb)
        rgba, bbox = extract_part(skin_bgr, color_map, color_index)
        if rgba is None:
            print("SKIP (no pixels found)")
            continue
        filename = f"{part_name}.png"
        out_path = output_dir / filename
        cv2.imwrite(str(out_path), rgba)
        manifest[part_name] = filename
        print(f"OK  ({bbox['width']}x{bbox['height']})")

    manifest_path = output_dir / 'manifest.json'
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)
    print(f"\nSaved manifest: {manifest_path}")

    skins_json = script_dir.parent / 'public' / 'skins' / 'skins.json'
    update_skins_json(skins_json, skin_id, display_name)

    try:
        from skin_layout import generate_for_skin
        layout_path = generate_for_skin(output_dir)
        print(f"Wrote layout    : {layout_path}")
    except Exception as e:
        print(f"WARN: layout.json generation failed: {e}")

    print(f"\nDone! Start the dev server and select '{display_name}' from the Skin dropdown.")


if __name__ == '__main__':
    main()
