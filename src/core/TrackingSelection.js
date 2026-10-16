import { videoPointToScreen } from './FrameGeometry.js';

// Reject unusable sources BEFORE they block fallback detectors.
export function usableFeet(landmarks, width, height, vw, vh, mirrored = false, minimum = 0.4) {
  if (!landmarks) return null;
  const out = Array(33).fill(null);
  let count = 0;
  for (const ids of [[27,29,31],[28,30,32]]) {
    const points = ids.map(i=>landmarks[i]);
    if (!points.every(p=>p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility??p.presence??0)>=minimum)) continue;
    const [heel,toe] = points.slice(1).map(p=>videoPointToScreen(p,width,height,vw,vh,mirrored));
    if (![heel,toe].every(p=>p.screenX>=0&&p.screenX<=width&&p.screenY>=0&&p.screenY<=height) || Math.hypot(heel.screenX-toe.screenX,heel.screenY-toe.screenY)<25) continue;
    for (const id of ids) out[id]=landmarks[id];
    count++;
  }
  return count?out:null;
}
