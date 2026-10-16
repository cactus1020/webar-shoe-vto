import { modelPointToVideo } from './FrameGeometry.js';

function overlap(a, b) {
  const width = Math.max(0, Math.min(a.cx + a.w / 2, b.cx + b.w / 2) - Math.max(a.cx - a.w / 2, b.cx - b.w / 2));
  const height = Math.max(0, Math.min(a.cy + a.h / 2, b.cy + b.h / 2) - Math.max(a.cy - a.h / 2, b.cy - b.h / 2));
  const area = width * height;
  return area / Math.max(1e-8, a.w * a.h + b.w * b.h - area);
}

export function decodeFootPoses(tensor, geometry, { mirrored = false, minConfidence = 0.28, minKeypointConfidence = 0.28 } = {}) {
  if (!tensor || tensor.dims?.[0] !== 1 || tensor.dims?.[1] !== 23 || tensor.dims[2] < 1) return null;
  const anchors = tensor.dims[2], data = tensor.data;
  if (!data || data.length !== 23 * anchors) return null;
  const candidates = [];
  for (let i = 0; i < anchors; i++) {
    const value = channel => data[channel * anchors + i];
    const confidence = value(4);
    if (!Number.isFinite(confidence) || confidence < minConfidence) continue;
    const cx = value(0), cy = value(1), w = value(2), h = value(3);
    if (![cx, cy, w, h].every(Number.isFinite) || w <= 0 || h <= 0) continue;
    const keypoints = Array.from({ length: 6 }, (_, k) => ({ x: value(5 + k * 3), y: value(6 + k * 3), v: value(7 + k * 3) }));
    const heel = keypoints[0], toe = keypoints[4];
    if (![heel, toe].every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && p.v >= minKeypointConfidence &&
        p.x >= geometry.padX - 4 && p.x <= geometry.padX + geometry.drawWidth + 4 &&
        p.y >= geometry.padY - 4 && p.y <= geometry.padY + geometry.drawHeight + 4 &&
        Math.abs(p.x - cx) <= w * 0.85 && Math.abs(p.y - cy) <= h * 0.85)) continue;
    if (Math.hypot(toe.x - heel.x, toe.y - heel.y) < 10) continue;
    candidates.push({ cx, cy, w, h, confidence, keypoints });
  }
  candidates.sort((a, b) => b.confidence - a.confidence);
  const kept = [];
  for (const candidate of candidates) {
    if (kept.every(other => overlap(candidate, other) < 0.4)) kept.push(candidate);
    if (kept.length === 2) break;
  }
  if (!kept.length) return null;
  const feet = kept.map(candidate => {
    const convert = point => ({ ...modelPointToVideo(point.x, point.y, geometry), z: 0,
      visibility: Math.min(candidate.confidence, point.v) });
    const heel = convert(candidate.keypoints[0]), toe = convert(candidate.keypoints[4]);
    const anklePoint = candidate.keypoints[1];
    const ankle = anklePoint.v >= minKeypointConfidence && Number.isFinite(anklePoint.x) && Number.isFinite(anklePoint.y)
      ? convert(anklePoint)
      : { x: heel.x + (toe.x - heel.x) * 0.12, y: heel.y + (toe.y - heel.y) * 0.12,
          z: 0, visibility: Math.min(heel.visibility, toe.visibility), estimated: true };
    return { heel, toe, ankle, confidence: Math.min(candidate.confidence, heel.visibility, toe.visibility),
      screenX: mirrored ? 1 - (heel.x + toe.x) / 2 : (heel.x + toe.x) / 2 };
  }).sort((a, b) => a.screenX - b.screenX);
  const landmarks = Array(33).fill(null);
  for (const [index, foot] of feet.entries()) {
    const right = feet.length === 2 ? index === 1 : foot.screenX >= 0.5;
    landmarks[right ? 28 : 27] = foot.ankle;
    landmarks[right ? 30 : 29] = foot.heel;
    landmarks[right ? 32 : 31] = foot.toe;
  }
  return { landmarks, worldLandmarks: null, isFootNet: true, feet, source: 'public-footnet' };
}
