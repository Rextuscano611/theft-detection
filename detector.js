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
  // For webcam testing:
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: VIDEO_WIDTH, height: VIDEO_HEIGHT }
  });
  video.srcObject = stream;
  await new Promise(resolve => video.onloadedmetadata = resolve);
  video.play();

  // For IP camera — comment out above and uncomment below:
  // video.src = 'http://YOUR_CAMERA_IP/video.mjpg';
  // video.crossOrigin = 'anonymous';
}

// ═══════════════════════════════════════════════
// POSE MATCHING
// Match each COCO-SSD person box to its closest MoveNet pose
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

  // Only accept if pose is within 150px of box center
  return bestDist < 150 ? bestPose : null;
}

// ═══════════════════════════════════════════════
// DRAWING FUNCTIONS
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
  ctx.lineWidth = 2;

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
    ctx.fillStyle  = active ? '#ffff00' : '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth   = 1.5;
    ctx.stroke();
  }
}

// ═══════════════════════════════════════════════
// MAIN DETECTION LOOP
// ═══════════════════════════════════════════════

let activePeopleLastFrame = new Set();

async function detectFrame() {
  frameCount++;

  // Process every 3rd frame to save CPU
  if (frameCount % 3 !== 0) {
    requestAnimationFrame(detectFrame);
    return;
  }

  // Clear canvas each frame
  ctx.clearRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);

  // Step 1: Detect all persons in frame
  const persons     = await cocoModel.detect(video);
  const personBoxes = persons.filter(p =>
    p.class === 'person' && p.score >= 0.5
  );

  // Step 2: Get all poses in one call
  const allPoses = await poseModel.estimatePoses(video);

  // Track active people this frame for cleanup
  const activePeopleThisFrame = new Set();

  // Step 3: Process each person independently
  for (let i = 0; i < personBoxes.length; i++) {
    const person = personBoxes[i];
    const [bx, by, bw, bh] = person.bbox;

    // Match this person box to its closest pose
    const matchedPose = matchPoseToPerson(person, allPoses);
    if (!matchedPose) continue;

    const keypoints = matchedPose.keypoints;
    activePeopleThisFrame.add(i);

    // Step 4: Evaluate signals for this person
    const signals = evaluateSignals(keypoints, i, VIDEO_HEIGHT);

    // Step 5: Calculate score and alert level
    const score = calculateScore(signals);
    const level = getAlertLevel(score);
    const color = getBBoxColor(level);

    // Build label
    const sigText = [
      signals.elbowActive    ? 'S1' : '',
      signals.shoulderActive ? 'S2' : ''
    ].filter(Boolean).join('+');

    const label = `P${i} ${sigText ? '| ' + sigText : ''} [${score}]`;

    // Step 6: Draw bounding box, skeleton, keypoints
    drawBoundingBox(ctx, { x: bx, y: by, width: bw, height: bh }, label, color);
    drawKeypoints(keypoints);
    drawSkeleton(keypoints);
    drawSignalKeypoints(keypoints, signals);

    // Step 7: Log alert if needed
    if (level !== 'none') {
      logAlert(level, signals, i);
    }
  }

  // Step 8: Clean up counters for people who left the frame
  for (const oldIndex of activePeopleLastFrame) {
    if (!activePeopleThisFrame.has(oldIndex)) {
      clearPersonCounter(oldIndex); // cleans signals.js counters
      clearPersonLog(oldIndex);     // cleans alert.js cooldown
    }
  }
  activePeopleLastFrame = activePeopleThisFrame;

  requestAnimationFrame(detectFrame);
}

// ═══════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════

(async () => {
  await loadModels();
  await startCamera();
  detectFrame();
})();