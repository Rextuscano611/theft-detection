const VIDEO_WIDTH  = 1280;
const VIDEO_HEIGHT = 720;

let cocoModel  = null;
let poseModel  = null;
let frameCount = 0;

const video  = document.getElementById('video');
const canvas = document.getElementById('overlay');
const ctx    = canvas.getContext('2d');

canvas.width  = VIDEO_WIDTH;
canvas.height = VIDEO_HEIGHT;

// Load shelf zones saved from setup.html
// Falls back to empty array if none configured yet
let shelfZones = [];

// ═══════════════════════════════════════════════
// LOAD MODELS
// ═══════════════════════════════════════════════

async function loadModels() {
  console.log('Loading COCO-SSD...');
  cocoModel = await cocoSsd.load();

  console.log('Loading MoveNet MultiPose...');
  poseModel = await poseDetection.createDetector(
    poseDetection.SupportedModels.MoveNet,
    { modelType: poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING }
  );

  console.log('Models ready — Multi-person tracking active.');
}

// ═══════════════════════════════════════════════
// CAMERA
// ═══════════════════════════════════════════════

async function startCamera() {
  // Webcam for testing
  // To use IP camera — comment out below and use video.src instead
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: VIDEO_WIDTH, height: VIDEO_HEIGHT }
  });
  video.srcObject = stream;
  await new Promise(resolve => video.onloadedmetadata = resolve);
  video.play();

  // IP camera example (uncomment when ready):
  // video.src = 'http://admin:password@192.168.1.64/video.mjpg';
  // video.crossOrigin = 'anonymous';
}

// ═══════════════════════════════════════════════
// POSE MATCHING
// Match each COCO-SSD bounding box to its
// closest MoveNet pose by shoulder midpoint proximity
// ═══════════════════════════════════════════════

function matchPoseToPerson(personBox, allPoses) {
  const [bx, by, bw, bh] = personBox.bbox;
  const boxCenterX = bx + bw / 2;
  const boxCenterY = by + bh / 2;

  let bestPose = null;
  let bestDist = Infinity;

  for (const pose of allPoses) {
    const ls = pose.keypoints[5]; // left_shoulder
    const rs = pose.keypoints[6]; // right_shoulder
    if (!ls || !rs) continue;

    const poseCenterX = (ls.x + rs.x) / 2;
    const poseCenterY = (ls.y + rs.y) / 2;

    const dist = Math.sqrt(
      Math.pow(poseCenterX - boxCenterX, 2) +
      Math.pow(poseCenterY - boxCenterY, 2)
    );

    if (dist < bestDist) {
      bestDist = dist;
      bestPose = pose;
    }
  }

  // Only accept match within 150px
  return bestDist < 150 ? bestPose : null;
}

// ═══════════════════════════════════════════════
// DRAWING — KEYPOINTS
// ═══════════════════════════════════════════════

function drawKeypoints(keypoints) {
  for (const kp of keypoints) {
    if (kp.score < 0.3) continue;

    ctx.beginPath();
    ctx.arc(kp.x, kp.y, 5, 0, 2 * Math.PI);
    ctx.fillStyle = '#00ff00';
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = '10px monospace';
    ctx.fillText(kp.name, kp.x + 7, kp.y + 4);
  }
}

// ═══════════════════════════════════════════════
// DRAWING — SKELETON
// ═══════════════════════════════════════════════

function drawSkeleton(keypoints) {
  const connections = [
    ['left_shoulder',  'right_shoulder'],
    ['left_shoulder',  'left_elbow'],
    ['left_elbow',     'left_wrist'],
    ['right_shoulder', 'right_elbow'],
    ['right_elbow',    'right_wrist'],
    ['left_shoulder',  'left_hip'],
    ['right_shoulder', 'right_hip'],
    ['left_hip',       'right_hip'],
    ['left_hip',       'left_knee'],
    ['right_hip',      'right_knee'],
    ['left_knee',      'left_ankle'],
    ['right_knee',     'right_ankle']
  ];

  const kpMap = {};
  for (const kp of keypoints) kpMap[kp.name] = kp;

  ctx.strokeStyle = '#00ff00';
  ctx.lineWidth   = 2;

  for (const [a, b] of connections) {
    const kpA = kpMap[a];
    const kpB = kpMap[b];
    if (!kpA || !kpB) continue;
    if (kpA.score < 0.3 || kpB.score < 0.3) continue;

    ctx.beginPath();
    ctx.moveTo(kpA.x, kpA.y);
    ctx.lineTo(kpB.x, kpB.y);
    ctx.stroke();
  }
}

// ═══════════════════════════════════════════════
// DRAWING — SIGNAL KEYPOINTS
// Highlights the 8 keypoints used in signal math
// Yellow when a signal is active, white when normal
// ═══════════════════════════════════════════════

function drawSignalKeypoints(keypoints, signals) {
  const signalPoints = [
    'left_shoulder', 'right_shoulder',
    'left_elbow',    'right_elbow',
    'left_wrist',    'right_wrist',
    'left_hip',      'right_hip'
  ];

  const kpMap = {};
  for (const kp of keypoints) kpMap[kp.name] = kp;

  for (const name of signalPoints) {
    const kp = kpMap[name];
    if (!kp || kp.score < 0.3) continue;

    const active = signals.elbowActive || signals.shoulderActive;

    ctx.beginPath();
    ctx.arc(kp.x, kp.y, 8, 0, 2 * Math.PI);
    ctx.fillStyle   = active ? '#ffff00' : '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth   = 1.5;
    ctx.stroke();
  }
}

// ═══════════════════════════════════════════════
// DRAWING — SHELF ZONES
// Draws saved shelf zones as faint yellow
// dashed rectangles on the live feed
// ═══════════════════════════════════════════════

function drawShelfZones(zones) {
  if (!zones || zones.length === 0) return;

  for (const zone of zones) {
    // Semi-transparent yellow fill
    ctx.fillStyle = 'rgba(240, 192, 64, 0.08)';
    ctx.fillRect(zone.x, zone.y, zone.width, zone.height);

    // Dashed yellow border
    ctx.strokeStyle = 'rgba(240, 192, 64, 0.4)';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(zone.x, zone.y, zone.width, zone.height);
    ctx.setLineDash([]);

    // Zone label in corner
    ctx.fillStyle = 'rgba(240, 192, 64, 0.6)';
    ctx.font      = '11px monospace';
    ctx.fillText(zone.label, zone.x + 4, zone.y + 14);
  }
}

// ═══════════════════════════════════════════════
// MAIN DETECTION LOOP
// ═══════════════════════════════════════════════

let activePeopleLastFrame = new Set();

async function detectFrame() {
  frameCount++;

  // Skip every 2 out of 3 frames to save CPU
  if (frameCount % 3 !== 0) {
    requestAnimationFrame(detectFrame);
    return;
  }

  // Clear canvas
  ctx.clearRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);

  // Always draw shelf zones on every frame
  drawShelfZones(shelfZones);

  // Step 1: Detect all persons
  const persons     = await cocoModel.detect(video);
  const personBoxes = persons.filter(p =>
    p.class === 'person' && p.score >= 0.5
  );

  // Step 2: Get all poses in one single call (MultiPose)
  const allPoses = await poseModel.estimatePoses(video);

  // Track who is active this frame for cleanup
  const activePeopleThisFrame = new Set();

  // Step 3: Process each detected person independently
  for (let i = 0; i < personBoxes.length; i++) {
    const person       = personBoxes[i];
    const [bx, by, bw, bh] = person.bbox;

    // Match this bounding box to its closest pose
    const matchedPose = matchPoseToPerson(person, allPoses);
    if (!matchedPose) continue;

    const keypoints = matchedPose.keypoints;
    activePeopleThisFrame.add(i);

    // Step 4: Check if person is inside a shelf zone
    // Use hip midpoint as person's ground position
    const kpMap = {};
    for (const kp of keypoints) kpMap[kp.name] = kp;

    const lHip = kpMap['left_hip'];
    const rHip = kpMap['right_hip'];

    let personInZone = false;

    if (lHip && rHip && lHip.score > 0.3 && rHip.score > 0.3) {
      const hipMidX = (lHip.x + rHip.x) / 2;
      const hipMidY = (lHip.y + rHip.y) / 2;
      personInZone  = isInsideAnyZone(hipMidX, hipMidY, shelfZones);
    }

    // Step 5: Evaluate signals
    // If zones are configured — only score inside zones
    // If no zones configured yet — score everywhere (testing fallback)
    const signals = (shelfZones.length === 0 || personInZone)
      ? evaluateSignals(keypoints, i, VIDEO_HEIGHT)
      : { elbowActive: false, shoulderActive: false };

    // Step 6: Calculate score and level
    const score = calculateScore(signals);
    const level = getAlertLevel(score);
    const color = getBBoxColor(level);

    // Build bounding box label
    const sigText = [
      signals.elbowActive    ? 'S1' : '',
      signals.shoulderActive ? 'S2' : ''
       
    ].filter(Boolean).join('+');

    const zoneTag = personInZone ? ' [ZONE]' : '';
    const label   = `P${i}${zoneTag} ${sigText ? '| ' + sigText : ''} [${score}]`;

    // Step 7: Draw everything for this person
    drawBoundingBox(
      ctx,
      { x: bx, y: by, width: bw, height: bh },
      label,
      color
    );
    drawKeypoints(keypoints);
    drawSkeleton(keypoints);
    drawSignalKeypoints(keypoints, signals);

    // Step 8: Log if alert level warrants it
    if (level !== 'none') {
      logAlert(level, signals, i);
    }
  }

  // Step 9: Clean up counters for people who left the frame
  for (const oldIndex of activePeopleLastFrame) {
    if (!activePeopleThisFrame.has(oldIndex)) {
      clearPersonCounter(oldIndex); // signals.js
      clearPersonLog(oldIndex);     // alert.js
    }
  }
  activePeopleLastFrame = activePeopleThisFrame;

  requestAnimationFrame(detectFrame);
}

// ═══════════════════════════════════════════════
// BOOT SEQUENCE
// ═══════════════════════════════════════════════

(async () => {
  // Load zones first before anything else
  shelfZones = loadShelfZones();
  console.log(`Loaded ${shelfZones.length} shelf zone(s).`);
  if (shelfZones.length === 0) {
    console.warn(
      'No shelf zones configured. ' +
      'Open setup.html to draw zones. ' +
      'Signals will score everywhere until zones are set.'
    );
  }

  await loadModels();
  await startCamera();
  detectFrame();
})();