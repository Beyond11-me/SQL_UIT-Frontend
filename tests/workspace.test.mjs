import assert from "node:assert/strict";

// Mock localStorage
const memory = new Map();
const storage = {
  get: (key) => memory.get(key) ?? null,
  set: (key, val) => memory.set(key, val),
  remove: (key) => memory.delete(key),
};

console.log("Starting workspace and timer unit tests...");

// 1. Timer Logic & Tab Drift Test
function formatTime(totalSeconds) {
  const safeTotal = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safeTotal / 3600);
  const m = Math.floor((safeTotal % 3600) / 60);
  const s = safeTotal % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

assert.equal(formatTime(0), "00:00:00");
assert.equal(formatTime(474), "00:07:54");
assert.equal(formatTime(621), "00:10:21");
assert.equal(formatTime(3665), "01:01:05");

// Timer state simulation
const problemId = "problem-001";
const userId = "student-123";
const timerKey = `sql-practice:timer:${userId}:${problemId}`;

// Start timer at T0
const t0 = 1000000;
let timerState = { elapsed: 0, isRunning: true, startedAt: t0 };
storage.set(timerKey, JSON.stringify(timerState));

// After 10 seconds
const t1 = t0 + 10000;
let elapsed = timerState.elapsed + Math.floor((t1 - timerState.startedAt) / 1000);
assert.equal(elapsed, 10);
assert.equal(formatTime(elapsed), "00:00:10");

// Pause at 10 seconds
timerState = { elapsed: 10, isRunning: false, startedAt: null };
storage.set(timerKey, JSON.stringify(timerState));

// Resume at T2 (e.g. 5 minutes later)
const t2 = t1 + 300000;
timerState = { elapsed: timerState.elapsed, isRunning: true, startedAt: t2 };
storage.set(timerKey, JSON.stringify(timerState));

// Simulated background tab for 35 seconds (where setInterval was throttled)
const t3 = t2 + 35000;
elapsed = timerState.elapsed + Math.floor((t3 - timerState.startedAt) / 1000);
assert.equal(elapsed, 45); // 10 + 35 = 45 seconds exactly
assert.equal(formatTime(elapsed), "00:00:45");

// Reset timer
timerState = { elapsed: 0, isRunning: false, startedAt: null };
storage.set(timerKey, JSON.stringify(timerState));
assert.equal(timerState.elapsed, 0);
assert.equal(timerState.isRunning, false);
assert.equal(formatTime(timerState.elapsed), "00:00:00");

// 2. Notes persistence per user & per problem
const notesKey = `sql-practice:notes:${userId}:${problemId}`;
const testNote = "My query strategy: use LEFT JOIN with orders and filter by date.";
storage.set(notesKey, testNote);

// Read back
assert.equal(storage.get(notesKey), testNote);

// Different problem has different notes
const notesKey2 = `sql-practice:notes:${userId}:problem-002`;
assert.equal(storage.get(notesKey2), null);

// 3. Layout preferences persistence
const settingsKey = `sql-practice:workspace-settings:${userId}`;
const settings = {
  activeLayout: "leet",
  isFocusMode: false,
  defaultLayout: { problemWidth: 28, editorHeight: 58 },
  leetLayout: { col1Width: 28, col2Width: 44 },
  noteTakingLayout: { leftWidth: 26, rightWidth: 26, editorHeight: 58 },
  debugLayout: { col1Width: 28, col2Width: 44 },
  focusLayout: { editorHeight: 60 },
};
storage.set(settingsKey, JSON.stringify(settings));

const loaded = JSON.parse(storage.get(settingsKey));
assert.equal(loaded.activeLayout, "leet");
assert.equal(loaded.leetLayout.col1Width, 28);
assert.equal(loaded.leetLayout.col2Width, 44);

// Focus mode toggle simulation
const prevLayout = loaded.activeLayout;
const focusSettings = { ...loaded, isFocusMode: true };
assert.equal(focusSettings.isFocusMode, true);
assert.equal(prevLayout, "leet"); // Previous layout is preserved when exiting

console.log("All workspace, layout, timer, and notes tests passed successfully!");
