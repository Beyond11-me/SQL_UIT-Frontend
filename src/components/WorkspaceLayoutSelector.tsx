import { useEffect, useRef, useState } from "react";
import { LayoutGrid, X, Check, Minimize2 } from "lucide-react";

export type WorkspaceLayoutType = "default" | "leet" | "note-taking" | "debug";

interface LayoutOption {
  id: WorkspaceLayoutType;
  name: string;
  description: string;
}

const LAYOUT_OPTIONS: LayoutOption[] = [
  {
    id: "default",
    name: "Default",
    description: "Đề bài bên trái · Editor & Kết quả bên phải",
  },
  {
    id: "leet",
    name: "Leet",
    description: "3 cột toàn chiều cao: Đề bài · Editor · Kết quả",
  },
  {
    id: "note-taking",
    name: "Note-taking",
    description: "Đề bài · Editor/Kết quả · Panel Ghi chú",
  },
  {
    id: "debug",
    name: "Debug",
    description: "Mở sẵn Database · Editor · Kết quả",
  },
];

interface WorkspaceLayoutSelectorProps {
  currentLayout: WorkspaceLayoutType;
  isFocusMode: boolean;
  onSelectLayout: (layout: WorkspaceLayoutType) => void;
  onToggleFocusMode: () => void;
}

export function WorkspaceLayoutSelector({
  currentLayout,
  isFocusMode,
  onSelectLayout,
  onToggleFocusMode,
}: WorkspaceLayoutSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close on outside click or Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (layoutId: WorkspaceLayoutType) => {
    onSelectLayout(layoutId);
    setIsOpen(false);
  };

  const handleFocusClick = () => {
    onToggleFocusMode();
    setIsOpen(false);
  };

  return (
    <div className="layout-popover-anchor" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`workspace-header-btn ${isOpen ? "is-active" : ""}`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="Chọn layout làm bài"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        title="Chọn layout làm bài"
      >
        <LayoutGrid size={18} />
      </button>

      {isOpen && (
        <div
          className="layout-popover"
          role="dialog"
          aria-modal="true"
          aria-label="Layouts"
        >
          <div className="layout-popover-header">
            <div className="layout-popover-title">
              <span>Layouts</span>
            </div>
            <button
              type="button"
              className="popover-close-btn"
              onClick={() => setIsOpen(false)}
              aria-label="Đóng bảng layout"
            >
              <X size={16} />
            </button>
          </div>

          <div className="layout-popover-grid">
            {LAYOUT_OPTIONS.map((option) => {
              const isSelected = !isFocusMode && currentLayout === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`layout-card ${isSelected ? "is-active" : ""}`}
                  onClick={() => handleSelect(option.id)}
                  aria-pressed={isSelected}
                  title={option.description}
                >
                  <div className="layout-thumb" aria-hidden="true">
                    {option.id === "default" && (
                      <>
                        <div className="thumb-block thumb-col thumb-left" />
                        <div className="thumb-col thumb-split">
                          <div className="thumb-block thumb-top" />
                          <div className="thumb-block thumb-bottom" />
                        </div>
                      </>
                    )}
                    {option.id === "leet" && (
                      <>
                        <div className="thumb-block thumb-col-3" />
                        <div className="thumb-block thumb-col-3" />
                        <div className="thumb-block thumb-col-3" />
                      </>
                    )}
                    {option.id === "note-taking" && (
                      <>
                        <div className="thumb-block thumb-col thumb-left-compact" />
                        <div className="thumb-col thumb-split-compact">
                          <div className="thumb-block thumb-top" />
                          <div className="thumb-block thumb-bottom" />
                        </div>
                        <div className="thumb-block thumb-col thumb-notes">
                          <span className="thumb-line" />
                          <span className="thumb-line" />
                        </div>
                      </>
                    )}
                    {option.id === "debug" && (
                      <>
                        <div className="thumb-block thumb-col-3 thumb-db">
                          <span className="thumb-db-line" />
                          <span className="thumb-db-line" />
                          <span className="thumb-db-line" />
                        </div>
                        <div className="thumb-block thumb-col-3" />
                        <div className="thumb-block thumb-col-3" />
                      </>
                    )}
                  </div>
                  <div className="layout-card-info">
                    <span className="layout-name">{option.name}</span>
                    {isSelected && (
                      <span className="layout-active-check">
                        <Check size={13} />
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="layout-popover-divider" />

          <button
            type="button"
            className={`focus-mode-card-btn ${isFocusMode ? "is-focus-active" : ""}`}
            onClick={handleFocusClick}
            title={isFocusMode ? "Thoát chế độ Focus" : "Bật chế độ Focus Mode (chỉ hiển thị Editor và Kết quả)"}
          >
            {isFocusMode ? (
              <>
                <Minimize2 size={16} />
                <span>Thoát Focus Mode</span>
              </>
            ) : (
              <>
                <span className="focus-emoji" aria-hidden="true">🧘</span>
                <span>Focus Mode</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
