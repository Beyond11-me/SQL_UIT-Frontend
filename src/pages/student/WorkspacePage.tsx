import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import CodeMirror from "@uiw/react-codemirror";
import { sql, MSSQL } from "@codemirror/lang-sql";
import { EditorView } from "@codemirror/view";
import { X, Star, RotateCcw, Maximize2, Minimize2, Braces } from "lucide-react";
import { indentRange } from "@codemirror/language";
import { AppHeader } from "../../components/AppHeader";
import { DataGrid, Dialog, Empty, Loading, Status } from "../../components/ui";
import { ProblemMarkdown } from "../../components/ProblemMarkdown";
import { useLoad } from "../../components/useLoad";
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { studentApi, type QueryResult } from "../../services/studentApi";
import { storage } from "../../services/storage";
import type { Problem, Submission } from "../../data/models";
import { parseDatabaseSchema } from "../../utils/parseDatabaseSchema";
import { parseSeedData } from "../../utils/parseSeedData";
import { AiChatPanel } from "../../components/AiChatPanel";
import { WorkspaceTimer } from "../../components/WorkspaceTimer";
import {
  WorkspaceLayoutSelector,
  type WorkspaceLayoutType,
} from "../../components/WorkspaceLayoutSelector";
import { WorkspaceNotes } from "../../components/WorkspaceNotes";

const LEGACY_LAYOUT_KEY = "sql-practice:workspace-layout";
const WORKSPACE_SETTINGS_KEY = (userId: string) => `sql-practice:workspace-settings:${userId}`;

interface WorkspaceLayoutSettings {
  activeLayout: WorkspaceLayoutType;
  isFocusMode: boolean;
  defaultLayout: {
    problemWidth: number;
    editorHeight: number;
  };
  leetLayout: {
    col1Width: number;
    col2Width: number;
  };
  noteTakingLayout: {
    leftWidth: number;
    rightWidth: number;
    editorHeight: number;
  };
  debugLayout: {
    col1Width: number;
    col2Width: number;
  };
  focusLayout: {
    editorHeight: number;
  };
}

const DEFAULT_SETTINGS: WorkspaceLayoutSettings = {
  activeLayout: "default",
  isFocusMode: false,
  defaultLayout: {
    problemWidth: 28,
    editorHeight: 58,
  },
  leetLayout: {
    col1Width: 28,
    col2Width: 44,
  },
  noteTakingLayout: {
    leftWidth: 26,
    rightWidth: 26,
    editorHeight: 58,
  },
  debugLayout: {
    col1Width: 28,
    col2Width: 44,
  },
  focusLayout: {
    editorHeight: 60,
  },
};

function clampPaneSize(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value * 10) / 10));
}

function readWorkspaceSettings(userId: string): WorkspaceLayoutSettings {
  try {
    const raw = storage.get(WORKSPACE_SETTINGS_KEY(userId));
    if (raw) {
      const parsed = JSON.parse(raw);
      const validLayouts: WorkspaceLayoutType[] = ["default", "leet", "note-taking", "debug"];
      return {
        activeLayout: validLayouts.includes(parsed.activeLayout) ? parsed.activeLayout : "default",
        isFocusMode: Boolean(parsed.isFocusMode),
        defaultLayout: {
          problemWidth: clampPaneSize(parsed.defaultLayout?.problemWidth ?? 28, 18, 50),
          editorHeight: clampPaneSize(parsed.defaultLayout?.editorHeight ?? 58, 25, 75),
        },
        leetLayout: {
          col1Width: clampPaneSize(parsed.leetLayout?.col1Width ?? 28, 18, 45),
          col2Width: clampPaneSize(parsed.leetLayout?.col2Width ?? 44, 25, 55),
        },
        noteTakingLayout: {
          leftWidth: clampPaneSize(parsed.noteTakingLayout?.leftWidth ?? 26, 18, 38),
          rightWidth: clampPaneSize(parsed.noteTakingLayout?.rightWidth ?? 26, 18, 38),
          editorHeight: clampPaneSize(parsed.noteTakingLayout?.editorHeight ?? 58, 25, 75),
        },
        debugLayout: {
          col1Width: clampPaneSize(parsed.debugLayout?.col1Width ?? 28, 18, 45),
          col2Width: clampPaneSize(parsed.debugLayout?.col2Width ?? 44, 25, 55),
        },
        focusLayout: {
          editorHeight: clampPaneSize(parsed.focusLayout?.editorHeight ?? 60, 25, 75),
        },
      };
    }

    const legacyRaw = storage.get(LEGACY_LAYOUT_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw);
      return {
        ...DEFAULT_SETTINGS,
        defaultLayout: {
          problemWidth: clampPaneSize(legacy.problemWidth ?? 28, 18, 50),
          editorHeight: clampPaneSize(legacy.editorHeight ?? 58, 25, 75),
        },
      };
    }
  } catch {
    // fallback
  }
  return DEFAULT_SETTINGS;
}

const editorTheme = EditorView.theme({
  "&": {
    backgroundColor: "var(--surface)",
    color: "var(--text)",
    height: "100%",
  },
  ".cm-content": {
    fontFamily: '"JetBrains Mono", monospace',
    padding: "24px 0",
    lineHeight: "24px",
  },
  ".cm-gutters": {
    backgroundColor: "var(--surface)",
    color: "var(--muted)",
    border: "none",
    padding: "0 8px 0 16px",
  },
  ".cm-activeLine": { backgroundColor: "var(--subtle)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent" },
  ".cm-cursor": { borderLeftColor: "var(--accent)" },
  ".cm-scroller": { overflow: "auto" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "var(--selection)",
  },
});

type ResizeTarget =
  | "default-v"
  | "default-h"
  | "leet-v1"
  | "leet-v2"
  | "note-v1"
  | "note-v2"
  | "note-h"
  | "debug-v1"
  | "debug-v2"
  | "focus-h";

export function WorkspacePage() {
  const { problemId = "" } = useParams();
  const [params] = useSearchParams();
  const context = params.get("context") || (params.get("source") || "Practice");
  const { data, loading, error } = useLoad(
    () => studentApi.getProblem(problemId, context),
    [problemId, context],
  );
  if (loading)
    return (
      <>
        <AppHeader
          workspace={{ title: "Loading problem…", number: "", topic: "" }}
        />
        <main id="main-content">
          <Loading />
        </main>
      </>
    );
  if (error || !data)
    return (
      <>
        <AppHeader />
        <main id="main-content">
          <Empty title="Problem unavailable">
            {error || "This problem ID does not exist."}{" "}
            <Link to="/practice">Back to practice</Link>
          </Empty>
        </main>
      </>
    );
  return <Workspace key={data.id} problem={data} />;
}

function Workspace({ problem }: { problem: Problem }) {
  const { dark } = useTheme();
  const { session } = useAuth();
  const userId = session?.id || session?.email || "guest";

  const [params] = useSearchParams();
  const source: Submission["source"] =
    params.get("source") === "Assignments"
      ? "Assignments"
      : params.get("source") === "Contests"
        ? "Contests"
        : "Practice";
  const context = params.get("context") || source;
  const contextTitle = params.get("contextTitle") || context;
  const contestMode = source === "Contests";
  const contestClosed = contestMode && params.get("closed") === "1";
  const contestAiAllowed = !contestMode || params.get("aiAllowed") === "1";

  // Initial Layout & Settings state
  const [initialSettings] = useState(() => readWorkspaceSettings(userId));
  const [layout, setLayout] = useState<WorkspaceLayoutType>(initialSettings.activeLayout);
  const [isFocusMode, setIsFocusMode] = useState(initialSettings.isFocusMode);
  const [prevLayout, setPrevLayout] = useState<WorkspaceLayoutType>(initialSettings.activeLayout);

  // Pane sizes per layout
  const [defaultProblemWidth, setDefaultProblemWidth] = useState(initialSettings.defaultLayout.problemWidth);
  const [defaultEditorHeight, setDefaultEditorHeight] = useState(initialSettings.defaultLayout.editorHeight);

  const [leetCol1Width, setLeetCol1Width] = useState(initialSettings.leetLayout.col1Width);
  const [leetCol2Width, setLeetCol2Width] = useState(initialSettings.leetLayout.col2Width);

  const [noteLeftWidth, setNoteLeftWidth] = useState(initialSettings.noteTakingLayout.leftWidth);
  const [noteRightWidth, setNoteRightWidth] = useState(initialSettings.noteTakingLayout.rightWidth);
  const [noteEditorHeight, setNoteEditorHeight] = useState(initialSettings.noteTakingLayout.editorHeight);

  const [debugCol1Width, setDebugCol1Width] = useState(initialSettings.debugLayout.col1Width);
  const [debugCol2Width, setDebugCol2Width] = useState(initialSettings.debugLayout.col2Width);

  const [focusEditorHeight, setFocusEditorHeight] = useState(initialSettings.focusLayout.editorHeight);

  // UI & Workspace state
  const [favorite, setFavorite] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [resizing, setResizing] = useState<"vertical" | "horizontal" | null>(null);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const editor = useRef<EditorView | null>(null);
  const workspaceLayout = useRef<HTMLDivElement | null>(null);
  const editorResults = useRef<HTMLDivElement | null>(null);
  const activeResize = useRef<ResizeTarget | null>(null);
  const expandTrigger = useRef<HTMLButtonElement>(null);

  const [code, setCode] = useState(
    () => studentApi.getDraft(problem.id) ?? (problem.draft || ""),
  );
  const [selected, setSelected] = useState("");
  const [problemTab, setProblemTab] = useState(layout === "debug" ? "Database" : "Description");
  const [resultTab, setResultTab] = useState("Run result");
  const [mobileTab, setMobileTab] = useState("Problem");
  const [help, setHelp] = useState<"Hint" | null>(null);
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const [helpText, setHelpText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [lastSubmit, setLastSubmit] = useState<QueryResult | null>(null);
  const [confirmResetQuery, setConfirmResetQuery] = useState(false);
  const [notice, setNotice] = useState("");
  const helpTrigger = useRef<HTMLButtonElement | null>(null);
  const helpClose = useRef<HTMLButtonElement>(null);
  const aiTrigger = useRef<HTMLButtonElement | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    studentApi.saveDraft(problem.id, code);
  }, [code, problem.id]);

  // Persist layout settings to storage
  useEffect(() => {
    const save = window.setTimeout(() => {
      const settings: WorkspaceLayoutSettings = {
        activeLayout: layout,
        isFocusMode,
        defaultLayout: {
          problemWidth: defaultProblemWidth,
          editorHeight: defaultEditorHeight,
        },
        leetLayout: {
          col1Width: leetCol1Width,
          col2Width: leetCol2Width,
        },
        noteTakingLayout: {
          leftWidth: noteLeftWidth,
          rightWidth: noteRightWidth,
          editorHeight: noteEditorHeight,
        },
        debugLayout: {
          col1Width: debugCol1Width,
          col2Width: debugCol2Width,
        },
        focusLayout: {
          editorHeight: focusEditorHeight,
        },
      };
      storage.set(WORKSPACE_SETTINGS_KEY(userId), JSON.stringify(settings));
      storage.set(
        LEGACY_LAYOUT_KEY,
        JSON.stringify({ problemWidth: defaultProblemWidth, editorHeight: defaultEditorHeight }),
      );
    }, 150);
    return () => window.clearTimeout(save);
  }, [
    userId,
    layout,
    isFocusMode,
    defaultProblemWidth,
    defaultEditorHeight,
    leetCol1Width,
    leetCol2Width,
    noteLeftWidth,
    noteRightWidth,
    noteEditorHeight,
    debugCol1Width,
    debugCol2Width,
    focusEditorHeight,
  ]);

  useEffect(() => {
    let active = true;
    studentApi.getPreferences().then((preferences) => {
      if (active) setFavorite(preferences.favorites.includes(problem.id));
    }).catch(() => { if (active) setNotice("Could not load saved problems."); });
    return () => { active = false; };
  }, [problem.id]);

  async function toggleSaved() {
    if (favoriteBusy) return;
    setFavoriteBusy(true);
    try {
      const response = await studentApi.toggleFavorite(problem.id);
      setFavorite(response.status === "added");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not update saved problems.");
    } finally {
      setFavoriteBusy(false);
    }
  }

  useEffect(() => {
    let active = true;
    if (help) {
      setHelpText("Loading guidance…");
      studentApi.getHint(problem.id, source === "Practice" ? undefined : context).then((t) => {
        if (active) setHelpText(t);
      }).catch(() => { if (active) setHelpText("Guidance is unavailable right now."); });
      helpClose.current?.focus();
    }
    return () => {
      active = false;
    };
  }, [help, problem.id, source, context]);

  function closeHelp() {
    setHelp(null);
    helpTrigger.current?.focus();
  }

  function closeAiPanel() {
    setIsAiPanelOpen(false);
    aiTrigger.current?.focus();
  }

  // Keyboard shortcut escape handling
  useEffect(() => {
    function escape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (expanded) {
          setExpanded(false);
          expandTrigger.current?.focus();
          return;
        }
        if (help) {
          setHelp(null);
          helpTrigger.current?.focus();
          return;
        }
        if (isFocusMode) {
          handleExitFocusMode();
          return;
        }
      }
    }
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("keydown", escape);
    };
  }, [help, expanded, isFocusMode, prevLayout]);

  async function run(kind: "selected" | "all" | "submit") {
    if (busy) return;
    setBusy(true);
    setExpanded(false);
    setNotice("");
    setResultTab(kind === "submit" ? "Submissions" : "Run result");
    setMobileTab("Result");
    try {
      const value =
        kind === "submit"
          ? await studentApi.submitSolution(
              problem.id,
              code,
              "SQL Server",
              source,
              context,
            )
          : await studentApi.runQuery(
              problem.id,
              kind === "selected" ? selected : code,
              "SQL Server",
              source,
              context,
            );
      if (alive.current) {
        if (kind === "submit") setLastSubmit(value);
        else setResult(value);
        setMobileTab("Result");
      }
    } catch (error) {
      if (alive.current)
        setNotice(error instanceof Error ? error.message : "The SQL runner is unavailable. Try again.");
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  // Pointer-based splitter resizing
  function resizeFromPointer(
    target: ResizeTarget,
    clientX: number,
    clientY: number,
  ) {
    const container = workspaceLayout.current;
    if (!container) return;
    const bounds = container.getBoundingClientRect();

    switch (target) {
      case "default-v": {
        if (!bounds.width) return;
        const pct = ((clientX - bounds.left) / bounds.width) * 100;
        setDefaultProblemWidth(clampPaneSize(pct, 18, 50));
        break;
      }
      case "default-h": {
        const edBounds = editorResults.current?.getBoundingClientRect();
        if (!edBounds?.height) return;
        const pct = ((clientY - edBounds.top) / edBounds.height) * 100;
        setDefaultEditorHeight(clampPaneSize(pct, 25, 75));
        break;
      }
      case "leet-v1": {
        if (!bounds.width) return;
        const pct = ((clientX - bounds.left) / bounds.width) * 100;
        const col1 = clampPaneSize(pct, 18, 45);
        if (100 - col1 - leetCol2Width >= 18) {
          setLeetCol1Width(col1);
        } else {
          setLeetCol1Width(col1);
          setLeetCol2Width(Math.max(25, 100 - col1 - 18));
        }
        break;
      }
      case "leet-v2": {
        if (!bounds.width) return;
        const totalPct = ((clientX - bounds.left) / bounds.width) * 100;
        const col2 = clampPaneSize(totalPct - leetCol1Width, 25, 55);
        if (100 - leetCol1Width - col2 >= 18) {
          setLeetCol2Width(col2);
        }
        break;
      }
      case "debug-v1": {
        if (!bounds.width) return;
        const pct = ((clientX - bounds.left) / bounds.width) * 100;
        const col1 = clampPaneSize(pct, 18, 45);
        if (100 - col1 - debugCol2Width >= 18) {
          setDebugCol1Width(col1);
        } else {
          setDebugCol1Width(col1);
          setDebugCol2Width(Math.max(25, 100 - col1 - 18));
        }
        break;
      }
      case "debug-v2": {
        if (!bounds.width) return;
        const totalPct = ((clientX - bounds.left) / bounds.width) * 100;
        const col2 = clampPaneSize(totalPct - debugCol1Width, 25, 55);
        if (100 - debugCol1Width - col2 >= 18) {
          setDebugCol2Width(col2);
        }
        break;
      }
      case "note-v1": {
        if (!bounds.width) return;
        const pct = ((clientX - bounds.left) / bounds.width) * 100;
        const left = clampPaneSize(pct, 18, 38);
        if (100 - left - noteRightWidth >= 30) {
          setNoteLeftWidth(left);
        }
        break;
      }
      case "note-v2": {
        if (!bounds.width) return;
        const rightOffset = bounds.right - clientX;
        const pctRight = (rightOffset / bounds.width) * 100;
        const right = clampPaneSize(pctRight, 18, 38);
        if (100 - noteLeftWidth - right >= 30) {
          setNoteRightWidth(right);
        }
        break;
      }
      case "note-h": {
        const edBounds = editorResults.current?.getBoundingClientRect();
        if (!edBounds?.height) return;
        const pct = ((clientY - edBounds.top) / edBounds.height) * 100;
        setNoteEditorHeight(clampPaneSize(pct, 25, 75));
        break;
      }
      case "focus-h": {
        const edBounds = editorResults.current?.getBoundingClientRect();
        if (!edBounds?.height) return;
        const pct = ((clientY - edBounds.top) / edBounds.height) * 100;
        setFocusEditorHeight(clampPaneSize(pct, 25, 75));
        break;
      }
    }
  }

  function startResize(
    target: ResizeTarget,
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    activeResize.current = target;
    const isVert = target.includes("-v");
    setResizing(isVert ? "vertical" : "horizontal");
    resizeFromPointer(target, event.clientX, event.clientY);
  }

  function moveResize(
    target: ResizeTarget,
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (activeResize.current !== target) return;
    resizeFromPointer(target, event.clientX, event.clientY);
  }

  function stopResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    activeResize.current = null;
    setResizing(null);
    window.dispatchEvent(new Event("resize"));
  }

  // Layout change handlers
  function handleSelectLayout(newLayout: WorkspaceLayoutType) {
    if (isFocusMode) {
      setIsFocusMode(false);
    }
    setLayout(newLayout);
    setPrevLayout(newLayout);
    if (newLayout === "debug") {
      setProblemTab("Database");
    }
    setTimeout(() => window.dispatchEvent(new Event("resize")), 60);
  }

  function handleToggleFocusMode() {
    if (isFocusMode) {
      setIsFocusMode(false);
      setLayout(prevLayout || "default");
    } else {
      setPrevLayout(layout);
      setIsFocusMode(true);
    }
    setTimeout(() => window.dispatchEvent(new Event("resize")), 60);
  }

  function handleExitFocusMode() {
    setIsFocusMode(false);
    setLayout(prevLayout || "default");
    setTimeout(() => window.dispatchEvent(new Event("resize")), 60);
  }

  const display = resultTab === "Submissions" ? lastSubmit : result;
  const schemaText = (problem as Problem & { schema?: string }).schema || "";
  const schemaTables = parseDatabaseSchema(schemaText);
  const seedDataText = (problem as Problem & { seedData?: string }).seedData || "";
  const seedTables = parseSeedData(seedDataText);

  // Sub-renderers for the 4 core components to prevent duplication
  const renderProblemPane = (customStyle?: CSSProperties) => (
    <section
      id="workspace-problem-pane"
      className={
        "problem-pane mobile-pane" +
        (mobileTab === "Problem" ? " mobile-visible" : "")
      }
      aria-label="Problem description"
      style={customStyle}
    >
      <div
        className="pane-tabs"
        role="tablist"
        aria-label="Problem information"
      >
        {["Description", "Database"].map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={problemTab === t}
            className={problemTab === t ? "active" : ""}
            onClick={() => setProblemTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="problem-scroll">
        {problemTab === "Description" ? (
          <>
            <p className="tiny">PROBLEM {problem.number}</p>
            <h1>{problem.title}</h1>
            <div className="problem-meta">
              <Status value={problem.difficulty || "Unknown"} />
              <Status value={problem.topic || "Uncategorized"} />
              <Status
                value={
                  lastSubmit?.status === "Accepted"
                    ? "Solved"
                    : (problem.progress || "Not started")
                }
              />
            </div>
            <ProblemMarkdown>{problem.description || ""}</ProblemMarkdown>
            <h3>Requirements</h3>
            <ProblemMarkdown>{problem.requirements || ""}</ProblemMarkdown>
            {problem.expected && (
              <>
                <h3>Expected output</h3>
                <DataGrid table={problem.expected} />
                <p className="tiny muted">Output shown for the sample dataset.</p>
              </>
            )}
            <hr />
          </>
        ) : (
          <>
            <h2>Database setup</h2>
            <p className="muted">SQL Server · read-only schema and seed data used for evaluation</p>
            <section className="schema-section">
              <h3>Schema</h3>
              {schemaTables.length ? (
                <div className="workspace-schema-tables">
                  {schemaTables.map((table, tableIndex) => (
                    <section className="workspace-schema-table-card" key={`${table.name}-${tableIndex}`}>
                      <h4>{table.name}</h4>
                      <div className="workspace-schema-table-scroll">
                        <table className="workspace-schema-table">
                          <thead>
                            <tr><th>Column</th><th>Type</th><th>Constraints</th></tr>
                          </thead>
                          <tbody>
                            {table.columns.map((column) => (
                              <tr key={column.name}>
                                <th scope="row">{column.name}</th>
                                <td>{column.type}</td>
                                <td>{column.constraints || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {(table.foreignKeys.length > 0 || table.constraints.length > 0) && (
                        <div className="workspace-schema-relations">
                          {table.foreignKeys.map((foreignKey, index) => (
                            <div className="workspace-schema-relation" key={`fk-${index}`}>
                              <span className="workspace-schema-relation-label">FOREIGN KEY</span>
                              <code>{foreignKey.columns.join(", ")}</code>
                              <span aria-hidden="true">→</span>
                              <code>{foreignKey.referencedTable}.{foreignKey.referencedColumns.join(", ")}</code>
                            </div>
                          ))}
                          {table.constraints.map((constraint, index) => (
                            <span className="workspace-schema-extra-constraint" key={`constraint-${index}`}>
                              {constraint}
                            </span>
                          ))}
                        </div>
                      )}
                    </section>
                  ))}
                </div>
              ) : (
                <pre className="workspace-schema-code"><code>{schemaText || "No schema provided."}</code></pre>
              )}
            </section>
            <section className="schema-section">
              <h3>Seed data</h3>
              {seedTables.length ? (
                <div className="workspace-seed-tables">
                  {seedTables.map((table, tableIndex) => (
                    <section className="workspace-schema-table-card" key={`${table.name}-${tableIndex}`}>
                      <h4>{table.name}</h4>
                      <div className="workspace-schema-table-scroll">
                        <table className="workspace-seed-table">
                          <thead>
                            <tr>{table.columns.map((column) => <th key={column}>{column}</th>)}</tr>
                          </thead>
                          <tbody>
                            {table.rows.map((row, rowIndex) => (
                              <tr key={rowIndex}>
                                {row.map((val, columnIndex) => (
                                  <td key={`${table.columns[columnIndex]}-${columnIndex}`}>{val}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <pre className="workspace-schema-code"><code>{seedDataText || "No seed data provided."}</code></pre>
              )}
            </section>
          </>
        )}
      </div>
      <div
        id="workspace-hint-panel"
        className={"help-drawer-region" + (help ? " is-open" : "")}
        aria-hidden={!help}
      >
        <div className="help-drawer-region-inner">
          <section className="help-drawer" aria-label="Problem help">
            <div className="section-heading">
              <div className="help-tabs">
                {(["Hint"] as const).map((t) => (
                  <button
                    className={help === t ? "active" : ""}
                    onClick={() => setHelp(t)}
                    key={t}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <button
                className="icon-button"
                ref={helpClose}
                onClick={closeHelp}
                aria-label="Collapse help"
              >
                <X size={18} />
              </button>
            </div>
            <ProblemMarkdown className="workspace-hint-content" aria-live="polite">
              {helpText}
            </ProblemMarkdown>
            <small className="muted">Guidance only · no complete solution.</small>
          </section>
        </div>
      </div>
      <div className="help-dock">
        <button
          ref={helpTrigger}
          disabled={contestMode}
          aria-expanded={!!help}
          aria-controls="workspace-hint-panel"
          title={contestMode ? "Hints are disabled during contests" : undefined}
          onClick={() => {
            if (help) closeHelp();
            else setHelp("Hint");
          }}
        >
          {help ? "Hide hint" : "Show hint"}
        </button>
        <button
          ref={aiTrigger}
          disabled={!contestAiAllowed}
          aria-expanded={isAiPanelOpen}
          aria-controls="workspace-ai-panel"
          title={!contestAiAllowed ? "AI assistance is disabled during contests" : undefined}
          onClick={() => {
            if (isAiPanelOpen) closeAiPanel();
            else {
              setIsAiPanelOpen(true);
              if (expanded) setExpanded(false);
            }
          }}
        >
          Ask AI
        </button>
        <button
          className="save-problem"
          aria-pressed={favorite}
          disabled={favoriteBusy}
          onClick={() => void toggleSaved()}
        >
          <Star size={15} fill={favorite ? "currentColor" : "none"} />
          {favorite ? "Saved" : "Save"}
        </button>
      </div>
    </section>
  );

  const renderEditorPane = (isFullColumn = false, customStyle?: CSSProperties) => (
    <section
      id="workspace-editor-pane"
      className={
        "editor-pane mobile-pane" +
        (mobileTab === "SQL" ? " mobile-visible" : "") +
        (isFullColumn ? " full-column" : "")
      }
      aria-label="SQL editor"
      style={customStyle}
    >
      <div className="editor-toolbar">
        <span className="editor-dialect">SQL Server</span>
        <button
          className="icon-button"
          type="button"
          aria-label="Reset SQL query"
          title="Reset SQL query"
          onClick={() => setConfirmResetQuery(true)}
        >
          <RotateCcw size={16} />
        </button>
        <b>query.sql</b>
        <button
          className="icon-button format-query"
          disabled={busy}
          aria-label="Format SQL indentation"
          title="Format SQL indentation"
          onClick={() => {
            const view = editor.current;
            if (view) {
              view.dispatch({
                changes: indentRange(view.state, 0, view.state.doc.length),
              });
              view.focus();
            }
          }}
        >
          <Braces size={17} />
        </button>
        <small className="muted">Draft saved locally</small>
        <button
          className="icon-button expand-editor"
          ref={expandTrigger}
          aria-label={expanded ? "Restore editor layout" : "Expand SQL editor"}
          aria-pressed={expanded}
          onClick={() => {
            setExpanded((value) => !value);
            setMobileTab("SQL");
          }}
        >
          {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>
      <div className="sql-editor">
        <CodeMirror
          value={code}
          height="100%"
          theme={dark ? "dark" : "light"}
          extensions={[sql({ dialect: MSSQL }), editorTheme]}
          onChange={setCode}
          onCreateEditor={(view) => {
            editor.current = view;
          }}
          onUpdate={(v) => {
            const selection = v.state.selection.main;
            const line = v.state.doc.lineAt(selection.head);
            setCursor({
              line: line.number,
              column: selection.head - line.from + 1,
            });
            setSelected(v.state.sliceDoc(selection.from, selection.to));
          }}
          aria-label="SQL query"
          basicSetup={{ foldGutter: false, highlightActiveLine: true }}
        />
      </div>
      <div className="editor-actions">
        <span className="cursor-position muted">
          Ln {cursor.line}, Col {cursor.column}
        </span>
        <button
          className="button"
          disabled={busy || !selected.trim()}
          title={!selected.trim() ? "Select SQL text in the editor first" : undefined}
          onClick={() => void run("selected")}
        >
          Run selected
        </button>
        <button
          className="button"
          disabled={busy}
          onClick={() => void run("all")}
        >
          Run all
        </button>
        <button
          className="button primary"
          disabled={busy || contestClosed}
          title={contestClosed ? "Contest submissions are closed" : undefined}
          onClick={() => void run("submit")}
        >
          {busy && resultTab === "Submissions"
            ? "Submitting…"
            : contestClosed
              ? "Submissions closed"
              : "Submit"}
        </button>
      </div>
    </section>
  );

  const renderResultPane = (isFullColumn = false, customStyle?: CSSProperties) => (
    <section
      id="workspace-result-pane"
      className={
        "result-pane mobile-pane" +
        (mobileTab === "Result" ? " mobile-visible" : "") +
        (isFullColumn ? " full-column" : "")
      }
      aria-label="Query output"
      style={customStyle}
    >
      <div className="pane-tabs" role="tablist" aria-label="Execution output">
        {["Run result", "Submissions"].map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={resultTab === t}
            className={resultTab === t ? "active" : ""}
            onClick={() => setResultTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className={"result-scroll" + (!display ? " idle" : "")} aria-live="polite">
        {busy ? (
          <Loading
            label={
              resultTab === "Submissions"
                ? "Submitting solution…"
                : "Running query…"
            }
          />
        ) : display ? (
          <>
            <Status value={display.status} />
            <p>{display.message}</p>
            {display.table && <DataGrid table={display.table} />}
            <p className="tiny muted">
              {resultTab === "Submissions"
                ? "Submission saved to your history."
                : "Executed against the problem dataset."}
            </p>
            {resultTab === "Submissions" && (
              <Link className="text-button" to="/submissions">
                View submission history →
              </Link>
            )}
          </>
        ) : (
          <>
            <h2>
              {resultTab === "Submissions"
                ? "No submissions yet"
                : "No result yet"}
            </h2>
            <p className="muted">
              Run the query to preview returned data. Submit when ready for evaluation.
            </p>
            <small>SQL Server evaluation</small>
          </>
        )}
        {notice && (
          <p role="status" className="form-message">
            {notice}
          </p>
        )}
      </div>
    </section>
  );

  const effectiveLayout = isFocusMode ? "focus" : layout;
  const mobileTabOptions =
    effectiveLayout === "note-taking"
      ? ["Problem", "SQL", "Result", "Notes"]
      : ["Problem", "SQL", "Result"];

  return (
    <div
      className={
        "workspace" +
        (expanded ? " editor-expanded" : "") +
        (isFocusMode ? " focus-mode-active" : "") +
        ` layout-${effectiveLayout}` +
        (resizing ? ` is-resizing resizing-${resizing}` : "")
      }
    >
      <AppHeader
        workspace={{
          title: problem.title,
          number: problem.number,
          topic: problem.topic || "Uncategorized",
          source,
          context: source === "Practice" ? problem.topic || "Uncategorized" : contextTitle,
          backTo:
            source === "Assignments"
              ? "/assignments"
              : source === "Contests"
                ? "/contests"
                : "/practice",
        }}
        workspaceActions={
          <>
            {isFocusMode && (
              <button
                type="button"
                className="focus-mode-exit-btn"
                onClick={handleExitFocusMode}
                title="Thoát Focus Mode (Esc)"
              >
                <Minimize2 size={14} />
                <span>Thoát Focus</span>
              </button>
            )}
            <WorkspaceLayoutSelector
              currentLayout={layout}
              isFocusMode={isFocusMode}
              onSelectLayout={handleSelectLayout}
              onToggleFocusMode={handleToggleFocusMode}
            />
            <WorkspaceTimer problemId={problem.id} userId={userId} />
          </>
        }
      />
      <main id="main-content" className="workspace-main">
        <div
          className="workspace-mobile-tabs"
          role="tablist"
          aria-label="Workspace pane"
        >
          {mobileTabOptions.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={mobileTab === t}
              className={mobileTab === t ? "active" : ""}
              onClick={() => setMobileTab(t)}
            >
              {t}
            </button>
          ))}
        </div>

        <div
          ref={workspaceLayout}
          className={`workspace-layout ${isAiPanelOpen ? "with-ai" : ""}`}
        >
          {/* FOCUS MODE */}
            {effectiveLayout === "focus" && (
              <div
                id="workspace-editor-results"
                className="editor-results"
                ref={editorResults}
                style={{
                  width: "100%",
                  height: "100%",
                  gridTemplateRows: `minmax(0, ${focusEditorHeight}%) 12px minmax(0, 1fr)`,
                }}
              >
                {renderEditorPane(false)}
                <div
                  className="workspace-splitter workspace-splitter-horizontal"
                  role="separator"
                  aria-label="Resize editor and result panes"
                  aria-orientation="horizontal"
                  aria-valuemin={25}
                  aria-valuemax={75}
                  aria-valuenow={Math.round(focusEditorHeight)}
                  aria-valuetext={`Editor pane ${Math.round(focusEditorHeight)} percent`}
                  tabIndex={0}
                  onPointerDown={(e) => startResize("focus-h", e)}
                  onPointerMove={(e) => moveResize("focus-h", e)}
                  onPointerUp={stopResize}
                  onPointerCancel={stopResize}
                  onLostPointerCapture={() => {
                    activeResize.current = null;
                    setResizing(null);
                  }}
                  onDoubleClick={() => setFocusEditorHeight(60)}
                  onKeyDown={(e: ReactKeyboardEvent<HTMLDivElement>) => {
                    if (e.key === "ArrowUp") setFocusEditorHeight((v) => clampPaneSize(v - 2, 25, 75));
                    if (e.key === "ArrowDown") setFocusEditorHeight((v) => clampPaneSize(v + 2, 25, 75));
                  }}
                />
                {renderResultPane(false)}
              </div>
            )}

            {/* DEFAULT LAYOUT (2 Columns: Problem Left, Editor/Result Right) */}
            {effectiveLayout === "default" && (
              <>
                {renderProblemPane({
                  width: `${defaultProblemWidth}%`,
                  flex: `0 0 ${defaultProblemWidth}%`,
                })}
                <div
                  className="workspace-splitter workspace-splitter-vertical"
                  role="separator"
                  aria-label="Resize problem and editor panes"
                  aria-orientation="vertical"
                  aria-valuemin={18}
                  aria-valuemax={50}
                  aria-valuenow={Math.round(defaultProblemWidth)}
                  aria-valuetext={`Problem pane ${Math.round(defaultProblemWidth)} percent`}
                  tabIndex={0}
                  onPointerDown={(e) => startResize("default-v", e)}
                  onPointerMove={(e) => moveResize("default-v", e)}
                  onPointerUp={stopResize}
                  onPointerCancel={stopResize}
                  onLostPointerCapture={() => {
                    activeResize.current = null;
                    setResizing(null);
                  }}
                  onDoubleClick={() => setDefaultProblemWidth(28)}
                  onKeyDown={(e: ReactKeyboardEvent<HTMLDivElement>) => {
                    if (e.key === "ArrowLeft") setDefaultProblemWidth((v) => clampPaneSize(v - 2, 18, 50));
                    if (e.key === "ArrowRight") setDefaultProblemWidth((v) => clampPaneSize(v + 2, 18, 50));
                  }}
                />
                <div
                  id="workspace-editor-results"
                  className="editor-results"
                  ref={editorResults}
                  style={{
                    flex: "1 1 0%",
                    minWidth: 0,
                    gridTemplateRows: `minmax(0, ${defaultEditorHeight}%) 12px minmax(0, 1fr)`,
                  }}
                >
                  {renderEditorPane(false)}
                  <div
                    className="workspace-splitter workspace-splitter-horizontal"
                    role="separator"
                    aria-label="Resize editor and result panes"
                    aria-orientation="horizontal"
                    aria-valuemin={25}
                    aria-valuemax={75}
                    aria-valuenow={Math.round(defaultEditorHeight)}
                    aria-valuetext={`Editor pane ${Math.round(defaultEditorHeight)} percent`}
                    tabIndex={0}
                    onPointerDown={(e) => startResize("default-h", e)}
                    onPointerMove={(e) => moveResize("default-h", e)}
                    onPointerUp={stopResize}
                    onPointerCancel={stopResize}
                    onLostPointerCapture={() => {
                      activeResize.current = null;
                      setResizing(null);
                    }}
                    onDoubleClick={() => setDefaultEditorHeight(58)}
                    onKeyDown={(e: ReactKeyboardEvent<HTMLDivElement>) => {
                      if (e.key === "ArrowUp") setDefaultEditorHeight((v) => clampPaneSize(v - 2, 25, 75));
                      if (e.key === "ArrowDown") setDefaultEditorHeight((v) => clampPaneSize(v + 2, 25, 75));
                    }}
                  />
                  {renderResultPane(false)}
                </div>
              </>
            )}

            {/* LEET LAYOUT (3 Columns: Problem, Editor, Result - All full height) */}
            {effectiveLayout === "leet" && (
              <>
                {renderProblemPane({
                  width: `${leetCol1Width}%`,
                  flex: `0 0 ${leetCol1Width}%`,
                })}
                <div
                  className="workspace-splitter workspace-splitter-vertical"
                  role="separator"
                  aria-label="Resize problem and editor columns"
                  aria-orientation="vertical"
                  aria-valuemin={18}
                  aria-valuemax={45}
                  aria-valuenow={Math.round(leetCol1Width)}
                  aria-valuetext={`Problem column ${Math.round(leetCol1Width)} percent`}
                  tabIndex={0}
                  onPointerDown={(e) => startResize("leet-v1", e)}
                  onPointerMove={(e) => moveResize("leet-v1", e)}
                  onPointerUp={stopResize}
                  onPointerCancel={stopResize}
                  onLostPointerCapture={() => {
                    activeResize.current = null;
                    setResizing(null);
                  }}
                  onDoubleClick={() => setLeetCol1Width(28)}
                  onKeyDown={(e: ReactKeyboardEvent<HTMLDivElement>) => {
                    if (e.key === "ArrowLeft") setLeetCol1Width((v) => clampPaneSize(v - 2, 18, 45));
                    if (e.key === "ArrowRight") setLeetCol1Width((v) => clampPaneSize(v + 2, 18, 45));
                  }}
                />
                <div
                  className="workspace-col-full"
                  style={{
                    width: `${leetCol2Width}%`,
                    flex: `0 0 ${leetCol2Width}%`,
                  }}
                >
                  {renderEditorPane(true)}
                </div>
                <div
                  className="workspace-splitter workspace-splitter-vertical"
                  role="separator"
                  aria-label="Resize editor and result columns"
                  aria-orientation="vertical"
                  aria-valuemin={25}
                  aria-valuemax={55}
                  aria-valuenow={Math.round(leetCol2Width)}
                  aria-valuetext={`Editor column ${Math.round(leetCol2Width)} percent`}
                  tabIndex={0}
                  onPointerDown={(e) => startResize("leet-v2", e)}
                  onPointerMove={(e) => moveResize("leet-v2", e)}
                  onPointerUp={stopResize}
                  onPointerCancel={stopResize}
                  onLostPointerCapture={() => {
                    activeResize.current = null;
                    setResizing(null);
                  }}
                  onDoubleClick={() => setLeetCol2Width(44)}
                  onKeyDown={(e: ReactKeyboardEvent<HTMLDivElement>) => {
                    if (e.key === "ArrowLeft") setLeetCol2Width((v) => clampPaneSize(v - 2, 25, 55));
                    if (e.key === "ArrowRight") setLeetCol2Width((v) => clampPaneSize(v + 2, 25, 55));
                  }}
                />
                <div
                  className="workspace-col-full"
                  style={{
                    flex: "1 1 0%",
                    minWidth: 0,
                  }}
                >
                  {renderResultPane(true)}
                </div>
              </>
            )}

            {/* DEBUG LAYOUT (3 Columns: Database pane Left, Editor Middle, Result Right) */}
            {effectiveLayout === "debug" && (
              <>
                {renderProblemPane({
                  width: `${debugCol1Width}%`,
                  flex: `0 0 ${debugCol1Width}%`,
                })}
                <div
                  className="workspace-splitter workspace-splitter-vertical"
                  role="separator"
                  aria-label="Resize database and editor columns"
                  aria-orientation="vertical"
                  aria-valuemin={18}
                  aria-valuemax={45}
                  aria-valuenow={Math.round(debugCol1Width)}
                  aria-valuetext={`Database column ${Math.round(debugCol1Width)} percent`}
                  tabIndex={0}
                  onPointerDown={(e) => startResize("debug-v1", e)}
                  onPointerMove={(e) => moveResize("debug-v1", e)}
                  onPointerUp={stopResize}
                  onPointerCancel={stopResize}
                  onLostPointerCapture={() => {
                    activeResize.current = null;
                    setResizing(null);
                  }}
                  onDoubleClick={() => setDebugCol1Width(28)}
                  onKeyDown={(e: ReactKeyboardEvent<HTMLDivElement>) => {
                    if (e.key === "ArrowLeft") setDebugCol1Width((v) => clampPaneSize(v - 2, 18, 45));
                    if (e.key === "ArrowRight") setDebugCol1Width((v) => clampPaneSize(v + 2, 18, 45));
                  }}
                />
                <div
                  className="workspace-col-full"
                  style={{
                    width: `${debugCol2Width}%`,
                    flex: `0 0 ${debugCol2Width}%`,
                  }}
                >
                  {renderEditorPane(true)}
                </div>
                <div
                  className="workspace-splitter workspace-splitter-vertical"
                  role="separator"
                  aria-label="Resize editor and result columns"
                  aria-orientation="vertical"
                  aria-valuemin={25}
                  aria-valuemax={55}
                  aria-valuenow={Math.round(debugCol2Width)}
                  aria-valuetext={`Editor column ${Math.round(debugCol2Width)} percent`}
                  tabIndex={0}
                  onPointerDown={(e) => startResize("debug-v2", e)}
                  onPointerMove={(e) => moveResize("debug-v2", e)}
                  onPointerUp={stopResize}
                  onPointerCancel={stopResize}
                  onLostPointerCapture={() => {
                    activeResize.current = null;
                    setResizing(null);
                  }}
                  onDoubleClick={() => setDebugCol2Width(44)}
                  onKeyDown={(e: ReactKeyboardEvent<HTMLDivElement>) => {
                    if (e.key === "ArrowLeft") setDebugCol2Width((v) => clampPaneSize(v - 2, 25, 55));
                    if (e.key === "ArrowRight") setDebugCol2Width((v) => clampPaneSize(v + 2, 25, 55));
                  }}
                />
                <div
                  className="workspace-col-full"
                  style={{
                    flex: "1 1 0%",
                    minWidth: 0,
                  }}
                >
                  {renderResultPane(true)}
                </div>
              </>
            )}

            {/* NOTE-TAKING LAYOUT (Problem Left, Editor/Result Center, Notes Right) */}
            {effectiveLayout === "note-taking" && (
              <>
                {renderProblemPane({
                  width: `${noteLeftWidth}%`,
                  flex: `0 0 ${noteLeftWidth}%`,
                })}
                <div
                  className="workspace-splitter workspace-splitter-vertical"
                  role="separator"
                  aria-label="Resize problem and center workspace"
                  aria-orientation="vertical"
                  aria-valuemin={18}
                  aria-valuemax={38}
                  aria-valuenow={Math.round(noteLeftWidth)}
                  aria-valuetext={`Problem column ${Math.round(noteLeftWidth)} percent`}
                  tabIndex={0}
                  onPointerDown={(e) => startResize("note-v1", e)}
                  onPointerMove={(e) => moveResize("note-v1", e)}
                  onPointerUp={stopResize}
                  onPointerCancel={stopResize}
                  onLostPointerCapture={() => {
                    activeResize.current = null;
                    setResizing(null);
                  }}
                  onDoubleClick={() => setNoteLeftWidth(26)}
                  onKeyDown={(e: ReactKeyboardEvent<HTMLDivElement>) => {
                    if (e.key === "ArrowLeft") setNoteLeftWidth((v) => clampPaneSize(v - 2, 18, 38));
                    if (e.key === "ArrowRight") setNoteLeftWidth((v) => clampPaneSize(v + 2, 18, 38));
                  }}
                />
                <div
                  id="workspace-editor-results"
                  className="editor-results"
                  ref={editorResults}
                  style={{
                    flex: "1 1 0%",
                    minWidth: 0,
                    gridTemplateRows: `minmax(0, ${noteEditorHeight}%) 12px minmax(0, 1fr)`,
                  }}
                >
                  {renderEditorPane(false)}
                  <div
                    className="workspace-splitter workspace-splitter-horizontal"
                    role="separator"
                    aria-label="Resize editor and result panes"
                    aria-orientation="horizontal"
                    aria-valuemin={25}
                    aria-valuemax={75}
                    aria-valuenow={Math.round(noteEditorHeight)}
                    aria-valuetext={`Editor pane ${Math.round(noteEditorHeight)} percent`}
                    tabIndex={0}
                    onPointerDown={(e) => startResize("note-h", e)}
                    onPointerMove={(e) => moveResize("note-h", e)}
                    onPointerUp={stopResize}
                    onPointerCancel={stopResize}
                    onLostPointerCapture={() => {
                      activeResize.current = null;
                      setResizing(null);
                    }}
                    onDoubleClick={() => setNoteEditorHeight(58)}
                    onKeyDown={(e: ReactKeyboardEvent<HTMLDivElement>) => {
                      if (e.key === "ArrowUp") setNoteEditorHeight((v) => clampPaneSize(v - 2, 25, 75));
                      if (e.key === "ArrowDown") setNoteEditorHeight((v) => clampPaneSize(v + 2, 25, 75));
                    }}
                  />
                  {renderResultPane(false)}
                </div>
                <div
                  className="workspace-splitter workspace-splitter-vertical"
                  role="separator"
                  aria-label="Resize center workspace and notes column"
                  aria-orientation="vertical"
                  aria-valuemin={18}
                  aria-valuemax={38}
                  aria-valuenow={Math.round(noteRightWidth)}
                  aria-valuetext={`Notes column ${Math.round(noteRightWidth)} percent`}
                  tabIndex={0}
                  onPointerDown={(e) => startResize("note-v2", e)}
                  onPointerMove={(e) => moveResize("note-v2", e)}
                  onPointerUp={stopResize}
                  onPointerCancel={stopResize}
                  onLostPointerCapture={() => {
                    activeResize.current = null;
                    setResizing(null);
                  }}
                  onDoubleClick={() => setNoteRightWidth(26)}
                  onKeyDown={(e: ReactKeyboardEvent<HTMLDivElement>) => {
                    if (e.key === "ArrowLeft") setNoteRightWidth((v) => clampPaneSize(v + 2, 18, 38));
                    if (e.key === "ArrowRight") setNoteRightWidth((v) => clampPaneSize(v - 2, 18, 38));
                  }}
                />
                <div
                  style={{
                    width: `${noteRightWidth}%`,
                    flex: `0 0 ${noteRightWidth}%`,
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                  }}
                  className={mobileTab === "Notes" ? "mobile-visible" : ""}
                >
                  <WorkspaceNotes problemId={problem.id} userId={userId} />
                </div>
              </>
            )}

          <div
            id="workspace-ai-panel"
            className="workspace-ai-region"
            aria-hidden={!isAiPanelOpen}
          >
            <AiChatPanel
              problem={problem}
              code={code}
              onClose={closeAiPanel}
            />
          </div>
        </div>
      </main>
      {confirmResetQuery && (
        <Dialog title="Reset SQL query?" onClose={() => setConfirmResetQuery(false)}>
          <p>Your current SQL draft will be cleared from this browser.</p>
          <div className="dialog-actions">
            <button className="button" type="button" onClick={() => setConfirmResetQuery(false)}>
              Cancel
            </button>
            <button
              className="button primary"
              type="button"
              onClick={() => {
                setCode("");
                setResult(null);
                setLastSubmit(null);
                setConfirmResetQuery(false);
              }}
            >
              Clear query
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
