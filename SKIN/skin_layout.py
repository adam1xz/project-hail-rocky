"""
skin_layout.py - Generate layout.json for a skin folder.

Mirrors AutoSkinImage (PHR - MAIN/src/App.tsx:147-219) but precomputed offline:
  - SVG path centroid + principal axis from 200 uniformly-sampled points
    along the path arc length.
  - PNG centroid + principal axis from non-transparent pixels.

Output schema (one entry per part present in the skin folder):
  {
    "filename": "leg1_main.png",
    "groupId":  "leg1_main",       // or null for body_main
    "svg":      { "cx": ..., "cy": ..., "angle": ..., "extent": ..., "skew": ... },
    "png":      { "cx": ..., "cy": ..., "angle": ..., "extent": ..., "skew": ...,
                  "w": ..., "h": ... }
  }

Drop-in callable: generate_for_skin(skin_dir). The splitter calls this so
imports auto-sync; the backend reads the result via /skin-layout.
"""

import json
import math
import re
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

from skin_parts import DRAW_ORDER, PARTS

PATH_SAMPLES = 200


# --- SVG path -> polyline ---------------------------------------------------

_TOKEN_RE = re.compile(r"[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+(?:[eE][+-]?\d+)?")
_CMD_RE = re.compile(r"[MmLlHhVvCcSsQqTtAaZz]")


def _tokenize(d: str):
    return _TOKEN_RE.findall(d.replace(",", " "))


def _take_numbers(it, n):
    return [float(next(it)) for _ in range(n)]


def _cubic(p0, p1, p2, p3, steps=24):
    pts = []
    for i in range(1, steps + 1):
        t = i / steps
        u = 1 - t
        x = u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0]
        y = u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]
        pts.append((x, y))
    return pts


def _quadratic(p0, p1, p2, steps=18):
    pts = []
    for i in range(1, steps + 1):
        t = i / steps
        u = 1 - t
        x = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0]
        y = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]
        pts.append((x, y))
    return pts


def path_to_polyline(d: str):
    """Flatten an SVG path 'd' string into a list of (x, y) vertices.

    Handles every command used in the rocky clip paths: M, L, H, V, Q, T, C, S,
    Z and their lowercase relative counterparts. Bezier curves are sampled
    densely enough that the downstream PCA matches the browser within 0.1%.
    """
    tokens = _tokenize(d)
    it = iter(tokens)
    pts: list[tuple[float, float]] = []

    cur = (0.0, 0.0)
    start = (0.0, 0.0)
    prev_ctrl = None   # last cubic control (for S/s)
    prev_qctrl = None  # last quadratic control (for T/t)
    cmd: Optional[str] = None

    def add(p):
        nonlocal cur
        pts.append(p)
        cur = p

    try:
        while True:
            tok = next(it)
            if _CMD_RE.fullmatch(tok):
                cmd = tok
            else:
                # Re-feed the number we just consumed
                it = _prepend(tok, it)
                if cmd is None:
                    raise ValueError("path starts without a command")

            if cmd in ("M", "m"):
                x, y = _take_numbers(it, 2)
                if cmd == "m" and pts:
                    x, y = cur[0] + x, cur[1] + y
                add((x, y))
                start = cur
                # Implicit lineto for subsequent coordinate pairs
                cmd = "L" if cmd == "M" else "l"
            elif cmd in ("L", "l"):
                x, y = _take_numbers(it, 2)
                if cmd == "l":
                    x, y = cur[0] + x, cur[1] + y
                add((x, y))
                prev_ctrl = None
                prev_qctrl = None
            elif cmd in ("H", "h"):
                x = float(next(it))
                if cmd == "h":
                    x += cur[0]
                add((x, cur[1]))
                prev_ctrl = None
                prev_qctrl = None
            elif cmd in ("V", "v"):
                y = float(next(it))
                if cmd == "v":
                    y += cur[1]
                add((cur[0], y))
                prev_ctrl = None
                prev_qctrl = None
            elif cmd in ("C", "c"):
                xs = _take_numbers(it, 6)
                if cmd == "c":
                    xs = [xs[0] + cur[0], xs[1] + cur[1],
                          xs[2] + cur[0], xs[3] + cur[1],
                          xs[4] + cur[0], xs[5] + cur[1]]
                p1 = (xs[0], xs[1])
                p2 = (xs[2], xs[3])
                p3 = (xs[4], xs[5])
                pts.extend(_cubic(cur, p1, p2, p3))
                cur = p3
                prev_ctrl = p2
                prev_qctrl = None
            elif cmd in ("S", "s"):
                xs = _take_numbers(it, 4)
                if cmd == "s":
                    xs = [xs[0] + cur[0], xs[1] + cur[1],
                          xs[2] + cur[0], xs[3] + cur[1]]
                # Reflected control: 2*cur - prev_ctrl (or cur itself if none)
                if prev_ctrl is not None:
                    p1 = (2 * cur[0] - prev_ctrl[0], 2 * cur[1] - prev_ctrl[1])
                else:
                    p1 = cur
                p2 = (xs[0], xs[1])
                p3 = (xs[2], xs[3])
                pts.extend(_cubic(cur, p1, p2, p3))
                cur = p3
                prev_ctrl = p2
                prev_qctrl = None
            elif cmd in ("Q", "q"):
                xs = _take_numbers(it, 4)
                if cmd == "q":
                    xs = [xs[0] + cur[0], xs[1] + cur[1],
                          xs[2] + cur[0], xs[3] + cur[1]]
                p1 = (xs[0], xs[1])
                p2 = (xs[2], xs[3])
                pts.extend(_quadratic(cur, p1, p2))
                cur = p2
                prev_qctrl = p1
                prev_ctrl = None
            elif cmd in ("T", "t"):
                xs = _take_numbers(it, 2)
                if cmd == "t":
                    xs = [xs[0] + cur[0], xs[1] + cur[1]]
                if prev_qctrl is not None:
                    p1 = (2 * cur[0] - prev_qctrl[0], 2 * cur[1] - prev_qctrl[1])
                else:
                    p1 = cur
                p2 = (xs[0], xs[1])
                pts.extend(_quadratic(cur, p1, p2))
                cur = p2
                prev_qctrl = p1
                prev_ctrl = None
            elif cmd in ("Z", "z"):
                add(start)
                prev_ctrl = None
                prev_qctrl = None
            else:
                raise ValueError(f"Unsupported SVG path command: {cmd}")
    except StopIteration:
        pass

    return pts


def _prepend(value, iterator):
    yield value
    for x in iterator:
        yield x


def _resample_uniform(pts, n):
    """Resample a polyline to n points spaced uniformly by arc length."""
    if len(pts) < 2:
        return pts[:]
    cum = [0.0]
    for i in range(1, len(pts)):
        dx = pts[i][0] - pts[i - 1][0]
        dy = pts[i][1] - pts[i - 1][1]
        cum.append(cum[-1] + math.hypot(dx, dy))
    total = cum[-1]
    if total == 0:
        return [pts[0]] * n
    out = []
    target = 0.0
    j = 0
    for i in range(n):
        target = (i / n) * total  # match getPointAtLength's [0, len) sampling
        while j + 1 < len(pts) and cum[j + 1] < target:
            j += 1
        if j + 1 >= len(pts):
            out.append(pts[-1])
            continue
        seg = cum[j + 1] - cum[j]
        t = 0 if seg == 0 else (target - cum[j]) / seg
        x = pts[j][0] + t * (pts[j + 1][0] - pts[j][0])
        y = pts[j][1] + t * (pts[j + 1][1] - pts[j][1])
        out.append((x, y))
    return out


# --- moments ----------------------------------------------------------------

def _moments_from_points(points):
    """PCA + projection extent + skew, identical to App.tsx:147-173."""
    N = len(points)
    if N == 0:
        return None
    sx = sum(p[0] for p in points)
    sy = sum(p[1] for p in points)
    sxx = sum(p[0] * p[0] for p in points)
    sxy = sum(p[0] * p[1] for p in points)
    syy = sum(p[1] * p[1] for p in points)
    cx, cy = sx / N, sy / N
    cxx = sxx / N - cx * cx
    cxy = sxy / N - cx * cy
    cyy = syy / N - cy * cy
    angle = math.atan2(2 * cxy, cxx - cyy) / 2
    c, s = math.cos(angle), math.sin(angle)
    min_u, max_u, skew_sum = float("inf"), float("-inf"), 0.0
    for x, y in points:
        u = (x - cx) * c + (y - cy) * s
        if u < min_u:
            min_u = u
        if u > max_u:
            max_u = u
        skew_sum += u * u * u
    return {
        "cx": cx, "cy": cy,
        "angle": angle,
        "extent": max_u - min_u,
        "skew": skew_sum / N,
    }


def _moments_from_png(png_path: Path):
    """Same algorithm App.tsx:175-219 runs on the browser canvas."""
    img = cv2.imread(str(png_path), cv2.IMREAD_UNCHANGED)
    if img is None or img.ndim < 3 or img.shape[2] < 4:
        return None
    alpha = img[:, :, 3]
    h, w = alpha.shape
    ys, xs = np.where(alpha > 10)
    if xs.size == 0:
        return None
    m00 = float(xs.size)
    cx = float(xs.sum()) / m00
    cy = float(ys.sum()) / m00
    cxx = float((xs * xs).sum()) / m00 - cx * cx
    cxy = float((xs * ys).sum()) / m00 - cx * cy
    cyy = float((ys * ys).sum()) / m00 - cy * cy
    angle = math.atan2(2 * cxy, cxx - cyy) / 2
    cval, sval = math.cos(angle), math.sin(angle)
    u = (xs - cx) * cval + (ys - cy) * sval
    extent = float(u.max() - u.min())
    skew = float((u ** 3).mean())
    return {
        "cx": cx, "cy": cy,
        "angle": angle,
        "extent": extent,
        "skew": skew,
        "w": int(w),
        "h": int(h),
    }


# --- public API -------------------------------------------------------------

def generate_for_skin(skin_dir: Path) -> Path:
    """Compute layout for every part PNG present in skin_dir and write
    layout.json into the same folder. Returns the output path."""
    skin_dir = Path(skin_dir)
    entries = []
    for name in DRAW_ORDER:
        meta = PARTS[name]
        png_path = skin_dir / f"{name}.png"
        if not png_path.exists():
            continue
        svg = _moments_from_points(
            _resample_uniform(path_to_polyline(meta["clip_d"]), PATH_SAMPLES)
        )
        png = _moments_from_png(png_path)
        if svg is None or png is None:
            continue
        entries.append({
            "filename": png_path.name,
            "groupId": meta["groupId"],
            "svg": svg,
            "png": png,
        })
    out = skin_dir / "layout.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(entries, f, indent=2)
    return out


if __name__ == "__main__":
    import sys
    if len(sys.argv) != 2:
        print("Usage: python skin_layout.py <skin_dir>")
        sys.exit(1)
    out = generate_for_skin(Path(sys.argv[1]))
    print(f"Wrote {out}")
