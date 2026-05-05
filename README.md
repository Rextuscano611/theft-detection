# Grocery Store Theft Detection System

An AI-powered CCTV security system for grocery stores that runs entirely
in a Chrome browser using TensorFlow.js. No Python, no GPU, no training required.

---

## What It Does

Detects suspicious body movements in real time from CCTV footage and alerts
security guards with colored bounding boxes and a live event log.

The goal is not 100% confirmed theft — it raises a warning so the security
guard can focus attention on a suspicious person via camera.

---

## How It Works

Two behavioral signals are detected using pose estimation keypoints:

**Signal 1 — Elbow Flare Outward (S1)**
- Both elbows flare wider than shoulders
- At least one wrist drops below hip level
- Indicates: reaching into front pocket or waistband

**Signal 2 — Asymmetric Shoulder Dip (S2)**
- One shoulder drops more than 8% of frame height lower than the other
- Held for 2+ seconds continuously
- Indicates: placing item into side bag or deep pocket

**Scoring:**
| Signals Active | Score | Alert Level | Box Color |
|---|---|---|---|
| None | 0 | Normal | 🟢 Green |
| S1 or S2 alone | 25 | Watch | 🟡 Yellow |
| S1 + S2 together | 100 | High Alert | 🔴 Red |

---

## Models Used (No Training Required)

| Model | Purpose | Source |
|---|---|---|
| COCO-SSD | Person detection | TensorFlow.js CDN |
| MoveNet MultiPose Lightning | 17-point pose estimation | TensorFlow.js CDN |

---

## Tech Stack

- TensorFlow.js (browser-based inference)
- HTML5 Canvas (overlay drawing)
- Vanilla JavaScript (no frameworks)
- Node.js (local dev server only)
- Chrome (runtime environment)

---

## Project Structure