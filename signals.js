// MoveNet gives 17 keypoints. These are the index numbers we use:
// 5 = left shoulder, 6 = right shoulder
// 7 = left elbow,    8 = right elbow
// 9 = left wrist,    10 = right wrist
// 11 = left hip,     12 = right hip

const KP = {
    L_SHOULDER: 5, R_SHOULDER: 6,
    L_ELBOW: 7,    R_ELBOW: 8,
    L_WRIST: 9,    R_WRIST: 10,
    L_HIP: 11,     R_HIP: 12
  };
  
  // Minimum confidence to trust a keypoint
  const MIN_CONFIDENCE = 0.3;
  
  // How many consecutive frames a signal must be true before it activates
  // At ~8 processed frames/sec, 12 frames = ~1.5 seconds
  const PERSISTENCE_FRAMES = 12;
  
  // Per-person counters (keyed by bounding box index)
  const signalCounters = {};
  
  function getKeypoint(keypoints, name) {
    const kp = keypoints[KP[name]];
    if (!kp || kp.score < MIN_CONFIDENCE) return null;
    return kp; // { x, y, score }
  }
  
  function checkElbowFlare(keypoints, frameHeight) {
    const ls = getKeypoint(keypoints, 'L_SHOULDER');
    const rs = getKeypoint(keypoints, 'R_SHOULDER');
    const le = getKeypoint(keypoints, 'L_ELBOW');
    const re = getKeypoint(keypoints, 'R_ELBOW');
    const lw = getKeypoint(keypoints, 'L_WRIST');
    const rw = getKeypoint(keypoints, 'R_WRIST');
    const lh = getKeypoint(keypoints, 'L_HIP');
    const rh = getKeypoint(keypoints, 'R_HIP');
  
    if (!ls || !rs || !le || !re) return false;
  
    const shoulderWidth = Math.abs(ls.x - rs.x);
    if (shoulderWidth < 20) return false; // person too small or sideways
  
    // Elbow flare: elbows wider than shoulders by at least 15%
    const elbowSpan = Math.abs(le.x - re.x);
    const elbowFlaresOut = elbowSpan > shoulderWidth * 1.15;
  
    // Wrist below hip
    const hipY = lh && rh ? (lh.y + rh.y) / 2 : null;
    const wristBelowHip = hipY
      ? (lw && lw.y > hipY) || (rw && rw.y > hipY)
      : false;
  
    return elbowFlaresOut && wristBelowHip;
  }
  
  function checkShoulderDip(keypoints, frameHeight) {
    const ls = getKeypoint(keypoints, 'L_SHOULDER');
    const rs = getKeypoint(keypoints, 'R_SHOULDER');
  
    if (!ls || !rs) return false;
  
    const deltaY = Math.abs(ls.y - rs.y);
    const normalizedDelta = deltaY / frameHeight;
  
    // Must be more than 8% of frame height = ~12-15 degree tilt
    return normalizedDelta > 0.08;
  }
  
  // Main function called every frame per detected person
  function evaluateSignals(keypoints, personIndex, frameHeight) {
    if (!signalCounters[personIndex]) {
      signalCounters[personIndex] = { elbow: 0, shoulder: 0 };
    }
  
    const counters = signalCounters[personIndex];
  
    // Update counters — increment if true, reset to 0 if false
    if (checkElbowFlare(keypoints, frameHeight)) {
      counters.elbow = Math.min(counters.elbow + 1, PERSISTENCE_FRAMES + 5);
    } else {
      counters.elbow = 0;
    }
  
    if (checkShoulderDip(keypoints, frameHeight)) {
      counters.shoulder = Math.min(counters.shoulder + 1, PERSISTENCE_FRAMES + 5);
    } else {
      counters.shoulder = 0;
    }
  
    // Signal is only ACTIVE after holding for PERSISTENCE_FRAMES
    return {
      elbowActive:    counters.elbow   >= PERSISTENCE_FRAMES,
      shoulderActive: counters.shoulder >= PERSISTENCE_FRAMES
    };
  }
  
  // Clean up old person counters to save memory
  function clearPersonCounter(personIndex) {
    delete signalCounters[personIndex];
  }