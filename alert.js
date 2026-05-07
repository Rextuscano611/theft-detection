// ═══════════════════════════════════════════════
// SCORING — rebalanced for 3 signals
//
// Philosophy:
//   1 signal alone  = Watch only  (never orange or red)
//   2 signals       = Alert       (orange — guard should look)
//   3 signals       = High Alert  (red — guard must act)
//
// This means a person needs multiple simultaneous
// suspicious behaviors before a serious alert fires
// ═══════════════════════════════════════════════

function calculateScore(signals) {
  // Count how many signals are active
  const activeCount = [
    signals.elbowActive,
    signals.shoulderActive,
    signals.bagOpenActive
  ].filter(Boolean).length;

  // Score based on combinations
  if (activeCount === 0) return 0;
  if (activeCount === 1) return 25;   // Watch
  if (activeCount === 2) return 60;   // Alert
  if (activeCount >= 3)  return 100;  // High Alert

  return 0;
}

// ═══════════════════════════════════════════════
// ALERT LEVEL
// ═══════════════════════════════════════════════

function getAlertLevel(score) {
  if (score >= 75) return 'high';
  if (score >= 50) return 'alert';
  if (score >= 25) return 'watch';
  return 'none';
}

// ═══════════════════════════════════════════════
// BOUNDING BOX COLOR
// ═══════════════════════════════════════════════

function getBBoxColor(level) {
  switch (level) {
    case 'high':  return '#ff4040'; // red
    case 'alert': return '#f08020'; // orange
    case 'watch': return '#f0c040'; // yellow
    default:      return '#44aa44'; // green
  }
}

// ═══════════════════════════════════════════════
// DRAW BOUNDING BOX
// ═══════════════════════════════════════════════

function drawBoundingBox(ctx, box, label, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth   = 3;
  ctx.strokeRect(box.x, box.y, box.width, box.height);

  // Label background
  ctx.fillStyle = color;
  ctx.fillRect(box.x, box.y - 24, label.length * 8 + 12, 22);

  // Label text
  ctx.fillStyle = '#000000';
  ctx.font      = 'bold 13px monospace';
  ctx.fillText(label, box.x + 6, box.y - 7);
}

// ═══════════════════════════════════════════════
// LOG — with 5 second cooldown per person per level
// ═══════════════════════════════════════════════

const lastLogTime = {};

function logAlert(level, signals, personIndex) {
  if (level === 'none') return;

  const cooldownKey = `${personIndex}_${level}`;
  const now         = Date.now();

  if (lastLogTime[cooldownKey] && (now - lastLogTime[cooldownKey]) < 5000) {
    return;
  }

  lastLogTime[cooldownKey] = now;

  const log     = document.getElementById('alert-log');
  const time    = new Date().toLocaleTimeString();

  // Build signal text showing all 3 signals
  const sigText = [
    signals.elbowActive    ? 'S1:elbow'    : '',
    signals.shoulderActive ? 'S2:shoulder' : '',
    signals.bagOpenActive  ? 'S3:bagopen'  : ''
  ].filter(Boolean).join(' + ');

  const entry       = document.createElement('div');
  entry.className   = `log-entry ${level}`;
  entry.textContent = `[${time}] P${personIndex} | ${level.toUpperCase()} | ${sigText}`;

  log.prepend(entry);

  // Keep max 50 entries
  while (log.children.length > 50) {
    log.removeChild(log.lastChild);
  }
}

// ═══════════════════════════════════════════════
// CLEANUP — called when person leaves frame
// ═══════════════════════════════════════════════

function clearPersonLog(personIndex) {
  for (const key of Object.keys(lastLogTime)) {
    if (key.startsWith(`${personIndex}_`)) {
      delete lastLogTime[key];
    }
  }
}

// ═══════════════════════════════════════════════
// SCREENSHOT — disabled for development
// Uncomment for production deployment
// ═══════════════════════════════════════════════

function takeScreenshot(personIndex) {
  // const canvas = document.getElementById('overlay');
  // const link   = document.createElement('a');
  // link.download = `alert_P${personIndex}_${Date.now()}.png`;
  // link.href     = canvas.toDataURL();
  // link.click();
}