// ═══════════════════════════════════════════════
// SCORING
// ═══════════════════════════════════════════════

function calculateScore(signals) {
  let score = 0;
  if (signals.elbowActive)    score += 25;
  if (signals.shoulderActive) score += 25;
  // Bonus when both active together
  if (signals.elbowActive && signals.shoulderActive) score += 50;
  return score; // max 100
}

function getAlertLevel(score) {
  if (score >= 75) return 'high';
  if (score >= 50) return 'alert';
  if (score >= 25) return 'watch';
  return 'none';
}

function getBBoxColor(level) {
  switch (level) {
    case 'high':  return '#ff4040'; // red
    case 'alert': return '#f08020'; // orange
    case 'watch': return '#f0c040'; // yellow
    default:      return '#44aa44'; // green = normal
  }
}

// ═══════════════════════════════════════════════
// DRAWING
// ═══════════════════════════════════════════════

function drawBoundingBox(ctx, box, label, color) {
  // Draw the colored rectangle
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.strokeRect(box.x, box.y, box.width, box.height);

  // Label background
  ctx.fillStyle = color;
  ctx.fillRect(box.x, box.y - 24, label.length * 8 + 12, 22);

  // Label text
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 13px monospace';
  ctx.fillText(label, box.x + 6, box.y - 7);
}

// ═══════════════════════════════════════════════
// LOG COOLDOWN
// Prevents the same alert from logging every frame
// Only logs once every 5 seconds per person per level
// ═══════════════════════════════════════════════

const lastLogTime = {};

function logAlert(level, signals, personIndex) {
  if (level === 'none') return;

  // Unique key per person AND per alert level
  const cooldownKey = `${personIndex}_${level}`;
  const now = Date.now();

  // If last log for this person+level was less than 5 seconds ago, skip
  if (lastLogTime[cooldownKey] && (now - lastLogTime[cooldownKey]) < 5000) {
    return;
  }

  // Update last log time for this key
  lastLogTime[cooldownKey] = now;

  // Build log entry text
  const log     = document.getElementById('alert-log');
  const time    = new Date().toLocaleTimeString();
  const sigText = [
    signals.elbowActive    ? 'S1:elbow'    : '',
    signals.shoulderActive ? 'S2:shoulder' : ''
  ].filter(Boolean).join(' + ');

  const entry = document.createElement('div');
  entry.className = `log-entry ${level}`;
  entry.textContent = `[${time}] P${personIndex} | ${level.toUpperCase()} | ${sigText}`;

  // Add to top of log
  log.prepend(entry);

  // Keep only last 50 entries — prevents log growing forever
  while (log.children.length > 50) {
    log.removeChild(log.lastChild);
  }
}

// ═══════════════════════════════════════════════
// CLEANUP
// Called when a person leaves the frame
// Clears their cooldown entries from lastLogTime
// ═══════════════════════════════════════════════

function clearPersonLog(personIndex) {
  for (const key of Object.keys(lastLogTime)) {
    if (key.startsWith(`${personIndex}_`)) {
      delete lastLogTime[key];
    }
  }
}

// ═══════════════════════════════════════════════
// SCREENSHOT
// Disabled for development — enable for production
// ═══════════════════════════════════════════════

function takeScreenshot(personIndex) {
  // DISABLED FOR NOW
  // const canvas = document.getElementById('overlay');
  // const link   = document.createElement('a');
  // link.download = `alert_P${personIndex}_${Date.now()}.png`;
  // link.href     = canvas.toDataURL();
  // link.click();
}