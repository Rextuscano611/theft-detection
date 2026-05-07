// ═══════════════════════════════════════════════
// KEYPOINT INDEX MAP (MoveNet 17 keypoints)
// ═══════════════════════════════════════════════

const KP = {
  L_SHOULDER: 5,  R_SHOULDER: 6,
  L_ELBOW:    7,  R_ELBOW:    8,
  L_WRIST:    9,  R_WRIST:    10,
  L_HIP:      11, R_HIP:      12
};

const MIN_CONFIDENCE    = 0.3;
const PERSISTENCE_FRAMES = 18; // ~2 seconds at 8fps

// ═══════════════════════════════════════════════
// SIGNAL COUNTERS
// One counter object per person index
// ═══════════════════════════════════════════════

const signalCounters = {};

// ═══════════════════════════════════════════════
// WRIST HISTORY
// Stores last N wrist positions for bag open detection
// Key = personIndex, Value = array of {lx, ly, rx, ry}
// ═══════════════════════════════════════════════

const wristHistory = {};
const WRIST_HISTORY_LENGTH = 20; // store last 20 processed frames

// ═══════════════════════════════════════════════
// HELPER
// ═══════════════════════════════════════════════

function getKP(keypoints, name) {
  const kp = keypoints[KP[name]];
  if (!kp || kp.score < MIN_CONFIDENCE) return null;
  return kp;
}

// ═══════════════════════════════════════════════
// SIGNAL 1 — ELBOW FLARE OUTWARD
// Elbows flare wider than shoulders AND
// at least one wrist drops below hip level
// ═══════════════════════════════════════════════

function checkElbowFlare(keypoints) {
  const ls = getKP(keypoints, 'L_SHOULDER');
  const rs = getKP(keypoints, 'R_SHOULDER');
  const le = getKP(keypoints, 'L_ELBOW');
  const re = getKP(keypoints, 'R_ELBOW');
  const lw = getKP(keypoints, 'L_WRIST');
  const rw = getKP(keypoints, 'R_WRIST');
  const lh = getKP(keypoints, 'L_HIP');
  const rh = getKP(keypoints, 'R_HIP');

  if (!ls || !rs || !le || !re) return false;

  const shoulderWidth = Math.abs(ls.x - rs.x);
  if (shoulderWidth < 20) return false;

  // Elbows must be 35% wider than shoulders
  const elbowSpan     = Math.abs(le.x - re.x);
  const elbowFlaresOut = elbowSpan > shoulderWidth * 1.35;

  // At least one wrist below hip level
  const hipY         = lh && rh ? (lh.y + rh.y) / 2 : null;
  const wristBelowHip = hipY
    ? (lw && lw.y > hipY) || (rw && rw.y > hipY)
    : false;

  return elbowFlaresOut && wristBelowHip;
}

// ═══════════════════════════════════════════════
// SIGNAL 2 — ASYMMETRIC SHOULDER DIP
// One shoulder drops more than 8% of frame height
// lower than the other — item placed in bag/pocket
// ═══════════════════════════════════════════════

function checkShoulderDip(keypoints, frameHeight) {
  const ls = getKP(keypoints, 'L_SHOULDER');
  const rs = getKP(keypoints, 'R_SHOULDER');

  if (!ls || !rs) return false;

  const deltaY           = Math.abs(ls.y - rs.y);
  const normalizedDelta  = deltaY / frameHeight;

  return normalizedDelta > 0.08;
}

// ═══════════════════════════════════════════════
// SIGNAL 3 — BAG OPEN DETECTION
//
// What it detects:
//   Both wrists come CLOSE together at waist/hip level
//   then SEPARATE slowly — this is the exact motion of
//   opening a bag, backpack, or jacket zipper
//
// How it works:
//   Step A — RIGHT NOW check:
//     Both wrists are currently close together (within 15% 
//     of shoulder width) AND both wrists are at or below hip level
//     This catches the "holding bag open" moment
//
//   Step B — HISTORY check:
//     In the last 20 frames, wrist distance was small
//     AND is now getting larger (separation = bag opened)
//     This catches the full open-and-insert motion
//
//   Both A and B must be true for the signal to fire
// ═══════════════════════════════════════════════

function checkBagOpen(keypoints, personIndex) {
  const ls = getKP(keypoints, 'L_SHOULDER');
  const rs = getKP(keypoints, 'R_SHOULDER');
  const lw = getKP(keypoints, 'L_WRIST');
  const rw = getKP(keypoints, 'R_WRIST');
  const lh = getKP(keypoints, 'L_HIP');
  const rh = getKP(keypoints, 'R_HIP');

  if (!lw || !rw || !ls || !rs) return false;

  const shoulderWidth  = Math.abs(ls.x - rs.x);
  if (shoulderWidth < 20) return false;

  // Current wrist distance
  const wristDist = Math.sqrt(
    Math.pow(lw.x - rw.x, 2) +
    Math.pow(lw.y - rw.y, 2)
  );

  // Hip midpoint Y — wrists must be at or below this
  const hipY = lh && rh ? (lh.y + rh.y) / 2 : null;
  const wristsAtWaist = hipY
    ? (lw.y >= hipY * 0.75) && (rw.y >= hipY * 0.75)
    : true; // if no hip detected, allow it

  // Step A: Are wrists currently close together at waist level?
  // "Close" = within 20% of shoulder width
  const wristsClose = wristDist < shoulderWidth * 0.20;
  const stepA       = wristsClose && wristsAtWaist;

  // Update wrist history for this person
  if (!wristHistory[personIndex]) {
    wristHistory[personIndex] = [];
  }

  wristHistory[personIndex].push({
    dist: wristDist,
    atWaist: wristsAtWaist
  });

  // Keep only last N frames
  if (wristHistory[personIndex].length > WRIST_HISTORY_LENGTH) {
    wristHistory[personIndex].shift();
  }

  // Step B: In history, was there a moment where wrists were
  // close together at waist, followed by them separating?
  // Look for: min distance in history < 20% shoulder width
  // AND current distance is growing (separation happening)
  let stepB = false;

  if (wristHistory[personIndex].length >= 8) {
    const history    = wristHistory[personIndex];
    const recent     = history.slice(-8);  // last 8 frames
    const earlier    = history.slice(0, -8); // frames before that

    // Find minimum distance in earlier frames
    const minEarlierDist = Math.min(...earlier.map(h => h.dist));
    // Find minimum distance in recent frames
    const minRecentDist  = Math.min(...recent.map(h => h.dist));
    // Current distance
    const currentDist    = history[history.length - 1].dist;

    // Pattern: wrists were close before, now separating
    const wereClose   = minEarlierDist < shoulderWidth * 0.20;
    const nowSeparating = currentDist > minRecentDist * 1.3;

    // At least some frames at waist level
    const wasAtWaist  = earlier.some(h => h.atWaist);

    stepB = wereClose && nowSeparating && wasAtWaist;
  }

  // Both conditions together = strong bag open signal
  return stepA || stepB;
}

// ═══════════════════════════════════════════════
// MAIN SIGNAL EVALUATOR
// Called every processed frame per person
// Returns which signals are currently active
// ═══════════════════════════════════════════════

function evaluateSignals(keypoints, personIndex, frameHeight) {
  // Initialize counters for new person
  if (!signalCounters[personIndex]) {
    signalCounters[personIndex] = {
      elbow:   0,
      shoulder: 0,
      bagOpen:  0
    };
  }

  const c = signalCounters[personIndex];

  // ── Update each counter ──
  // Increment if condition met, reset to 0 if not
  // Signal only becomes ACTIVE after PERSISTENCE_FRAMES

  if (checkElbowFlare(keypoints)) {
    c.elbow = Math.min(c.elbow + 1, PERSISTENCE_FRAMES + 10);
  } else {
    c.elbow = 0;
  }

  if (checkShoulderDip(keypoints, frameHeight)) {
    c.shoulder = Math.min(c.shoulder + 1, PERSISTENCE_FRAMES + 10);
  } else {
    c.shoulder = 0;
  }

  // Bag open uses shorter persistence — 10 frames (~1.2s)
  // because the motion is quicker than held postures
  if (checkBagOpen(keypoints, personIndex)) {
    c.bagOpen = Math.min(c.bagOpen + 1, 15);
  } else {
    c.bagOpen = Math.max(c.bagOpen - 1, 0); // decay slowly, not instant reset
  }

  return {
    elbowActive:    c.elbow   >= PERSISTENCE_FRAMES,
    shoulderActive: c.shoulder >= PERSISTENCE_FRAMES,
    bagOpenActive:  c.bagOpen  >= 10
  };
}

// ═══════════════════════════════════════════════
// CLEANUP
// Called when person leaves the frame
// ═══════════════════════════════════════════════

function clearPersonCounter(personIndex) {
  delete signalCounters[personIndex];
  delete wristHistory[personIndex];
}

// ═══════════════════════════════════════════════
// ZONE FUNCTIONS
// Loaded from localStorage saved in setup.html
// ═══════════════════════════════════════════════

function loadShelfZones() {
  const saved = localStorage.getItem('shelfZones');
  return saved ? JSON.parse(saved) : [];
}

function isInsideAnyZone(x, y, zones) {
  for (const zone of zones) {
    if (
      x >= zone.x &&
      x <= zone.x + zone.width &&
      y >= zone.y &&
      y <= zone.y + zone.height
    ) {
      return true;
    }
  }
  return false;
}