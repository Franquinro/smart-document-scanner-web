const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function paperMaskMorphology(width, height) {
  const shortSide = Math.max(1, Math.min(Number(width), Number(height)));
  const odd = value => {
    const rounded = Math.max(1, Math.round(value));
    return rounded % 2 ? rounded : rounded + 1;
  };
  return {
    neutralOpen: shortSide < 480 ? 3 : odd(shortSide / 120),
    differenceOpen: shortSide < 480 ? 3 : odd(shortSide / 80),
    close: odd(Math.max(5, shortSide / 75)),
  };
}

export function orderPoints(points) {
  if (!Array.isArray(points) || points.length !== 4) throw new TypeError('Exactly four points are required');
  const normalized = points.map(({x, y}) => ({x: Number(x), y: Number(y)}));
  if (normalized.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) throw new TypeError('Points must be finite');
  if (new Set(normalized.map(p => `${p.x},${p.y}`)).size !== 4) throw new TypeError('Four unique points are required');
  const center = normalized.reduce((a, p) => ({x: a.x + p.x / 4, y: a.y + p.y / 4}), {x: 0, y: 0});
  const angular = normalized.slice().sort((a, b) => Math.atan2(a.y-center.y, a.x-center.x) - Math.atan2(b.y-center.y, b.x-center.x));
  let tlIndex = 0;
  angular.forEach((p, i) => { if (p.x + p.y < angular[tlIndex].x + angular[tlIndex].y) tlIndex = i; });
  const ordered = [...angular.slice(tlIndex), ...angular.slice(0, tlIndex)];
  // Clockwise in screen coordinates should go TL → TR. Reverse if the next point is BL.
  if (ordered[1].x < ordered[3].x) return [ordered[0], ordered[3], ordered[2], ordered[1]];
  return ordered;
}

export function polygonArea(points) {
  if (!Array.isArray(points) || points.length < 3) return 0;
  return Math.abs(points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length];
    return sum + p.x * q.y - q.x * p.y;
  }, 0) / 2);
}

function angleAt(a, b, c) {
  const u = {x: a.x-b.x, y: a.y-b.y};
  const v = {x: c.x-b.x, y: c.y-b.y};
  const denom = Math.hypot(u.x,u.y) * Math.hypot(v.x,v.y);
  if (!denom) return 0;
  return Math.acos(clamp((u.x*v.x + u.y*v.y) / denom, -1, 1)) * 180 / Math.PI;
}

export function quadMetrics(points, imageWidth, imageHeight, edgeSupport = 0) {
  const p = orderPoints(points);
  const sides = [distance(p[0],p[1]), distance(p[1],p[2]), distance(p[2],p[3]), distance(p[3],p[0])];
  const crosses = p.map((point, i) => {
    const a = p[(i+1)%4], b = p[(i+2)%4];
    return (a.x-point.x)*(b.y-a.y) - (a.y-point.y)*(b.x-a.x);
  });
  const convex = crosses.every(v => v > 0) || crosses.every(v => v < 0);
  const angles = p.map((point, i) => angleAt(p[(i+3)%4], point, p[(i+1)%4]));
  const angleScore = angles.reduce((sum, a) => sum + clamp(1 - Math.abs(90-a)/55), 0) / 4;
  const ratio = (a,b) => Math.min(a,b) / Math.max(a,b,1e-9);
  const oppositeConsistency = (ratio(sides[0],sides[2]) + ratio(sides[1],sides[3])) / 2;
  const coverage = polygonArea(p) / Math.max(1, imageWidth * imageHeight);
  const margin = Math.max(3, Math.min(imageWidth,imageHeight) * 0.015);
  const touchesEdge = p.some(q => q.x <= margin || q.y <= margin || q.x >= imageWidth-margin || q.y >= imageHeight-margin);
  const cornerSeparation = Math.min(...sides) / Math.max(1, Math.min(imageWidth,imageHeight));
  return { points:p, coverage, convex, angles, angleScore, oppositeConsistency,
    edgeSupport: clamp(edgeSupport), touchesEdge, cornerSeparation: clamp(cornerSeparation) };
}

export function scoreQuad(metrics) {
  if (!metrics.convex || metrics.coverage < 0.05) return 0;
  const coverageScore = clamp((metrics.coverage - 0.08) / 0.72);
  const separationScore = clamp(metrics.cornerSeparation / 0.25);
  const borderPenalty = metrics.touchesEdge ? 0.045 : 0;
  return clamp(0.31*coverageScore + 0.25*metrics.angleScore + 0.2*metrics.oppositeConsistency +
    0.19*metrics.edgeSupport + 0.05*separationScore - borderPenalty);
}

export function evaluateDetection(corners, imageWidth, imageHeight, {confidence = 0, method = 'unknown'} = {}) {
  const ordered = orderPoints(corners);
  const margin = Math.max(3, Math.min(imageWidth,imageHeight) * 0.015);
  const edgeSets = ordered.map(p => [
    p.x <= margin && 'left', p.x >= imageWidth-margin && 'right',
    p.y <= margin && 'top', p.y >= imageHeight-margin && 'bottom'
  ].filter(Boolean));
  const touchingCorners = edgeSets.filter(edges => edges.length).length;
  const touchedEdges = new Set(edgeSets.flat());
  const adjacentPair = [['left','top'],['top','right'],['right','bottom'],['bottom','left']]
    .some(([a,b]) => touchedEdges.has(a) && touchedEdges.has(b));
  const severeEdgeTouch = touchingCorners >= 2 || touchedEdges.size >= 3 || adjacentPair;
  const anyEdgeTouch = touchingCorners > 0;
  const reliableColorMethod = /lab|paper|color/i.test(method);
  const needsManual = confidence < 0.58 || severeEdgeTouch ||
    (anyEdgeTouch && !(confidence >= 0.86 && reliableColorMethod));
  return {corners: ordered, confidence: clamp(confidence), method, needsManual};
}

export function chooseDetectionCandidate(candidates) {
  if (!Array.isArray(candidates) || !candidates.length) return null;
  const ranked = candidates.slice().sort((a,b) => b.score-a.score);
  const best = ranked[0];
  const paper = ranked.filter(c => /lab|paper|color/i.test(c.method) && c.score >= 0.62)
    .sort((a,b) => b.metrics.coverage-a.metrics.coverage)[0];
  if (paper && paper.metrics.coverage >= best.metrics.coverage*1.15 && paper.score >= best.score-0.16) return paper;
  return best;
}

export function computeOutputSize(points, {min = 1, max = 10000} = {}) {
  const [tl,tr,br,bl] = orderPoints(points);
  let width = Math.max(distance(tl,tr), distance(bl,br));
  let height = Math.max(distance(tl,bl), distance(tr,br));
  const scale = Math.min(1, max / Math.max(width,height));
  width = Math.max(min, Math.round(width * scale));
  height = Math.max(min, Math.round(height * scale));
  return {width, height};
}
