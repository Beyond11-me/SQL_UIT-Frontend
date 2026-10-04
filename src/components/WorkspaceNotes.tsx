import { useEffect, useState, type ChangeEvent } from "react";
import { StickyNote, Copy, Check, Trash2 } from "lucide-react";
import { storage } from "../services/storage";

interface WorkspaceNotesProps {
  problemId: string;
  userId?: string;
}

function getNotesStorageKey(userId: string | undefined, problemId: string): string {
  const safeUser = userId || "guest";
  return `sql-practice:notes:${safeUser}:${problemId}`;
}

export function WorkspaceNotes({ problemId, userId }: WorkspaceNotesProps) {
  const storageKey = getNotesStorageKey(userId, problemId);
  const [notes, setNotes] = useState(() => storage.get(storageKey) || "");
  const [copied, setCopied] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving">("saved");

  // Re-sync if problemId or userId changes
  useEffect(() => {
    setNotes(storage.get(storageKey) || "");
    setSaveStatus("saved");
  }, [storageKey]);

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setNotes(val);
    setSaveStatus("saving");
    storage.set(storageKey, val);
    const timer = setTimeout(() => setSaveStatus("saved"), 300);
    return () => clearTimeout(timer);
  };

  const handleCopy = async () => {
    if (!notes.trim()) return;
    try {
      await navigator.clipboard.writeText(notes);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleClear = () => {
    if (!notes.trim()) return;
    if (window.confirm("Bạn có chắc chắn muốn xóa toàn bộ ghi chú của bài này?")) {
      setNotes("");
      storage.set(storageKey, "");
      setSaveStatus("saved");
    }
  };

  const wordCount = notes.trim() ? notes.trim().split(/\s+/).length : 0;
  const charCount = notes.length;

  return (
    <section
      id="workspace-notes-pane"
      className="notes-pane mobile-pane"
      aria-label="Panel ghi chú"
    >
      <div className="notes-header">
        <div className="notes-title">
          <StickyNote size={15} />
          <span>Notes</span>
        </div>
        <div className="notes-actions">
          <span className="notes-saved-status" title="Ghi chú được tự động lưu trong trình duyệt">
            {saveStatus === "saved" ? "✓ Đã lưu" : "Đang lưu..."}
          </span>
          <button
            type="button"
            className="icon-button notes-action-btn"
            onClick={handleCopy}
            disabled={!notes.trim()}
            title={copied ? "Đã sao chép!" : "Sao chép ghi chú"}
            aria-label="Sao chép ghi chú"
          >
            {copied ? <Check size={14} color="var(--success)" /> : <Copy size={14} />}
          </button>
          <button
            type="button"
            className="icon-button notes-action-btn"
            onClick={handleClear}
            disabled={!notes.trim()}
            title="Xóa ghi chú"
            aria-label="Xóa ghi chú"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="notes-content">
        <textarea
          className="notes-textarea"
          value={notes}
          onChange={handleChange}
          placeholder={`Ghi chú khi giải bài này...\n\n- Ý tưởng truy vấn & thuật toán\n- Các bảng & điều kiện JOIN\n- Trường hợp biên cần lưu ý`}
          aria-label="Nội dung ghi chú"
          spellCheck={false}
        />
      </div>

      <div className="notes-footer">
        <span>{wordCount} từ · {charCount} ký tự</span>
        <span>Lưu cục bộ</span>
      </div>
    </section>
  );
}
