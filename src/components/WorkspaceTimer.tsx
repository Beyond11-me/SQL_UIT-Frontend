import { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { storage } from "../services/storage";

interface StoredTimer {
  elapsed: number;
  isRunning: boolean;
  startedAt: number | null;
}

interface WorkspaceTimerProps {
  problemId: string;
  userId?: string;
}

function getTimerStorageKey(userId: string | undefined, problemId: string): string {
  const safeUser = userId || "guest";
  return `sql-practice:timer:${safeUser}:${problemId}`;
}

function readStoredTimer(key: string): StoredTimer {
  try {
    const raw = storage.get(key);
    if (!raw) return { elapsed: 0, isRunning: false, startedAt: null };
    const parsed = JSON.parse(raw);
    return {
      elapsed: typeof parsed.elapsed === "number" && Number.isFinite(parsed.elapsed) ? Math.max(0, parsed.elapsed) : 0,
      isRunning: Boolean(parsed.isRunning),
      startedAt: typeof parsed.startedAt === "number" && Number.isFinite(parsed.startedAt) ? parsed.startedAt : null,
    };
  } catch {
    return { elapsed: 0, isRunning: false, startedAt: null };
  }
}

function formatTime(totalSeconds: number): string {
  const safeTotal = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safeTotal / 3600);
  const m = Math.floor((safeTotal % 3600) / 60);
  const s = safeTotal % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function WorkspaceTimer({ problemId, userId }: WorkspaceTimerProps) {
  const storageKey = getTimerStorageKey(userId, problemId);
  const [collapsed, setCollapsed] = useState(false);
  const [displaySeconds, setDisplaySeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  // In-memory ref to maintain accurate reference across interval & visibility events
  const timerStateRef = useRef<StoredTimer>({ elapsed: 0, isRunning: false, startedAt: null });

  // Load state when problemId or userId changes
  useEffect(() => {
    const stored = readStoredTimer(storageKey);
    let currentSeconds = stored.elapsed;
    if (stored.isRunning && stored.startedAt) {
      const diff = Math.floor((Date.now() - stored.startedAt) / 1000);
      currentSeconds += Math.max(0, diff);
    }
    timerStateRef.current = stored;
    setDisplaySeconds(currentSeconds);
    setIsRunning(stored.isRunning);
  }, [storageKey]);

  // Tick interval when running
  useEffect(() => {
    if (!isRunning) return;

    const tick = () => {
      const { elapsed, startedAt, isRunning: active } = timerStateRef.current;
      if (!active || !startedAt) return;
      const diff = Math.floor((Date.now() - startedAt) / 1000);
      setDisplaySeconds(elapsed + Math.max(0, diff));
    };

    tick();
    const interval = window.setInterval(tick, 500);

    // Refresh instantly when user switches back to this tab
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isRunning]);

  const toggleTimer = () => {
    const current = timerStateRef.current;
    if (current.isRunning) {
      // Pause
      const now = Date.now();
      const diff = current.startedAt ? Math.floor((now - current.startedAt) / 1000) : 0;
      const newElapsed = current.elapsed + Math.max(0, diff);
      const nextState: StoredTimer = {
        elapsed: newElapsed,
        isRunning: false,
        startedAt: null,
      };
      timerStateRef.current = nextState;
      storage.set(storageKey, JSON.stringify(nextState));
      setDisplaySeconds(newElapsed);
      setIsRunning(false);
    } else {
      // Start or Resume
      const nextState: StoredTimer = {
        elapsed: timerStateRef.current.elapsed,
        isRunning: true,
        startedAt: Date.now(),
      };
      timerStateRef.current = nextState;
      storage.set(storageKey, JSON.stringify(nextState));
      setIsRunning(true);
    }
  };

  const resetTimer = () => {
    const nextState: StoredTimer = {
      elapsed: 0,
      isRunning: false,
      startedAt: null,
    };
    timerStateRef.current = nextState;
    storage.set(storageKey, JSON.stringify(nextState));
    setDisplaySeconds(0);
    setIsRunning(false);
  };

  return (
    <div
      className={`workspace-timer ${collapsed ? "is-collapsed" : ""}`}
      role="timer"
      aria-label="Đồng hồ làm bài"
    >
      <button
        type="button"
        className="workspace-timer-toggle"
        onClick={() => setCollapsed((v) => !v)}
        title={collapsed ? "Mở rộng đồng hồ" : "Thu gọn đồng hồ"}
        aria-label={collapsed ? "Mở rộng đồng hồ" : "Thu gọn đồng hồ"}
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      {!collapsed ? (
        <>
          <button
            type="button"
            className={`workspace-timer-main ${isRunning ? "is-running" : ""}`}
            onClick={toggleTimer}
            title={isRunning ? "Tạm dừng đồng hồ" : displaySeconds > 0 ? "Tiếp tục đếm giờ" : "Bắt đầu tính giờ"}
            aria-label={isRunning ? "Tạm dừng đồng hồ" : displaySeconds > 0 ? "Tiếp tục đếm giờ" : "Bắt đầu tính giờ"}
          >
            <span className="workspace-timer-icon" aria-hidden="true">
              {isRunning ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
            </span>
            <span className="workspace-timer-digits">{formatTime(displaySeconds)}</span>
          </button>
          <button
            type="button"
            className="workspace-timer-reset"
            onClick={resetTimer}
            title="Đặt lại về 00:00:00"
            aria-label="Đặt lại về 00:00:00"
          >
            <RotateCcw size={13} />
          </button>
        </>
      ) : (
        <button
          type="button"
          className={`workspace-timer-collapsed-btn ${isRunning ? "is-running" : ""}`}
          onClick={() => setCollapsed(false)}
          title={`Đồng hồ: ${formatTime(displaySeconds)} (${isRunning ? "Đang chạy" : "Tạm dừng"})`}
          aria-label="Mở rộng đồng hồ"
        >
          <Clock size={14} />
        </button>
      )}
    </div>
  );
}
