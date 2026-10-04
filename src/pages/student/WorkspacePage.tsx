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
import { useAuth } from "../../context/AuthContext";
import { WorkspaceTools } from "../../components/WorkspaceTools";
import { clamp as clampPaneSize, defaults, readLayouts, workspaceKey, type Layout, type PaneSizes } from "../../utils/workspacePreferences";
import "../../styles/workspace.css";
import { AppHeader } from "../../components/AppHeader";
import { DataGrid, Dialog, Empty, Loading, Status } from "../../components/ui";
import { ProblemMarkdown } from "../../components/ProblemMarkdown";
import { useLoad } from "../../components/useLoad";
import { useTheme } from "../../context/ThemeContext";
import { studentApi, type QueryResult } from "../../services/studentApi";
import { storage } from "../../services/storage";
import type { Problem, Submission } from "../../data/models";
import { parseDatabaseSchema } from "../../utils/parseDatabaseSchema";
import { parseSeedData } from "../../utils/parseSeedData";
import { AiChatPanel } from "../../components/AiChatPanel";

const DEFAULT_EDITOR_HEIGHT = 58;
const MIN_PROBLEM_WIDTH = 18;
const MAX_PROBLEM_WIDTH = 50;
const MIN_EDITOR_HEIGHT = 30;
const MAX_EDITOR_HEIGHT = 75;

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
export function WorkspacePage() {
  const { problemId = "" } = useParams();
  const { session } = useAuth();
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
  return <Workspace key={`${session?.id}:${data.id}`} problem={data} />;
}
function Workspace({ problem }: { problem: Problem }) {
  const { dark } = useTheme();
  const { session } = useAuth();
  const layoutKey = workspaceKey(session?.id || "anonymous", "preferences", "layouts");
  const notesKey = workspaceKey(session?.id || "anonymous", problem.id, "notes");
  const [preferences, setPreferences] = useState(() => readLayouts(layoutKey));
  const layout = preferences.layout;
  const [focus, setFocus] = useState(false);
  const [focusHeight, setFocusHeight] = useState(DEFAULT_EDITOR_HEIGHT);
  const [notes, setNotes] = useState(() => storage.get(notesKey) || "");
  const { problemWidth, secondBoundary } = preferences.sizes[layout];
  const editorHeight = focus ? focusHeight : preferences.sizes[layout].editorHeight;
  const threeColumns = !focus && (layout === "Leet" || layout === "Debug");
  function updateSizes(change: Partial<PaneSizes>) {
    setPreferences(value => ({ ...value, sizes: { ...value.sizes, [value.layout]: { ...value.sizes[value.layout], ...change } } }));
  }
  function setProblemWidth(value: number | ((previous: number) => number)) {
    updateSizes({ problemWidth: typeof value === "function" ? value(problemWidth) : value });
  }
  function setEditorHeight(value: number | ((previous: number) => number)) {
    const next = typeof value === "function" ? value(editorHeight) : value;
    if (focus) setFocusHeight(next); else updateSizes({ editorHeight: next });
  }
  function chooseLayout(value: Layout) {
    setPreferences(previous => ({ ...previous, layout: value }));
    setExpanded(false);
    setFocus(false);
    if (value === "Debug") setProblemTab("Database");
  }
  function toggleFocus() {
    if (!focus) setFocusHeight(preferences.sizes[layout].editorHeight);
    setFocus(value => !value); setExpanded(false); setMobileTab("SQL");
  }
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
  const [favorite, setFavorite] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [resizing, setResizing] = useState<"vertical" | "horizontal" | "secondary" | null>(null);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const editor = useRef<EditorView | null>(null);
  const workspaceLayout = useRef<HTMLDivElement | null>(null);
  const editorResults = useRef<HTMLDivElement | null>(null);
  const activeResize = useRef<"vertical" | "horizontal" | "secondary" | null>(null);
  const expandTrigger = useRef<HTMLButtonElement>(null);
  const [code, setCode] = useState(
    () => studentApi.getDraft(problem.id) ?? (problem.draft || ""),
  );
  const [selected, setSelected] = useState("");
  const [problemTab, setProblemTab] = useState(layout === "Debug" ? "Database" : "Description");
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
  useEffect(() => { storage.set(layoutKey, JSON.stringify(preferences)); }, [layoutKey, preferences]);
  useEffect(() => {
    const node = workspaceLayout.current;
    if (!node) return;
    const observer = new ResizeObserver(() => editor.current?.requestMeasure());
    const editorNode = node.querySelector(".sql-editor");
    if (editorNode) observer.observe(editorNode);
    return () => observer.disconnect();
  }, []);
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
        }
      }
    }
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("keydown", escape);
    };
  }, [help, expanded]);
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
  function resizeFromPointer(
    orientation: "vertical" | "horizontal" | "secondary",
    clientX: number,
    clientY: number,
  ) {
    if (orientation === "vertical") {
      const bounds = workspaceLayout.current?.getBoundingClientRect();
      if (!bounds?.width) return;
      setProblemWidth(
        clampPaneSize(
          ((clientX - bounds.left) / bounds.width) * 100,
          MIN_PROBLEM_WIDTH,
          layout === "Default" ? MAX_PROBLEM_WIDTH : secondBoundary - 26,
        ),
      );
      return;
    }
    if (orientation === "secondary") {
      const bounds = workspaceLayout.current?.getBoundingClientRect();
      if (bounds?.width) updateSizes({ secondBoundary: clampPaneSize(((clientX - bounds.left) / bounds.width) * 100, problemWidth + 26, 82) });
      return;
    }
    const bounds = editorResults.current?.getBoundingClientRect();
    if (!bounds?.height) return;
    setEditorHeight(
      clampPaneSize(
        ((clientY - bounds.top) / bounds.height) * 100,
        MIN_EDITOR_HEIGHT,
        MAX_EDITOR_HEIGHT,
      ),
    );
  }
  function startResize(
    orientation: "vertical" | "horizontal" | "secondary",
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    activeResize.current = orientation;
    setResizing(orientation);
    resizeFromPointer(orientation, event.clientX, event.clientY);
  }
  function moveResize(
    orientation: "vertical" | "horizontal" | "secondary",
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (activeResize.current !== orientation) return;
    resizeFromPointer(orientation, event.clientX, event.clientY);
  }
  function stopResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    activeResize.current = null;
    setResizing(null);
  }
  function resizeWithKeyboard(
    orientation: "vertical" | "horizontal" | "secondary",
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) {
    const direction = orientation !== "horizontal"
      ? event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0
      : event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    if (!direction) return;
    event.preventDefault();
    if (orientation === "vertical") {
      setProblemWidth((value) =>
        clampPaneSize(value + direction * 2, MIN_PROBLEM_WIDTH, layout === "Default" ? MAX_PROBLEM_WIDTH : secondBoundary - 26),
      );
    } else if (orientation === "secondary") {
      updateSizes({ secondBoundary: clampPaneSize(secondBoundary + direction * 2, problemWidth + 26, 82) });
    } else {
      setEditorHeight((value) =>
        clampPaneSize(value + direction * 2, MIN_EDITOR_HEIGHT, MAX_EDITOR_HEIGHT),
      );
    }
  }
  const display = resultTab === "Submissions" ? lastSubmit : result;
  const schemaText = (problem as Problem & { schema?: string }).schema || "";
  const schemaTables = parseDatabaseSchema(schemaText);
  const seedDataText = (problem as Problem & { seedData?: string }).seedData || "";
  const seedTables = parseSeedData(seedDataText);
  return (
    <div className={"workspace" + (expanded ? " editor-expanded" : "") + (focus ? " focus-mode" : "") + (resizing ? ` is-resizing resizing-${resizing === "secondary" ? "vertical" : resizing}` : "")}>
      <AppHeader
        workspaceActions={<WorkspaceTools layout={layout} onLayout={chooseLayout} focus={focus} onFocus={toggleFocus} timerKey={workspaceKey(session?.id || "anonymous", problem.id, "timer")} />}
        workspace={{
          title: problem.title,
          number: problem.number,
          topic: problem.topic || "Uncategorized",
          source,
          context: source === "Practice" ? problem.topic || "Uncategorized" : contextTitle,
          backTo: source === "Assignments" ? "/assignments" : source === "Contests" ? "/contests" : "/practice",
        }}
      />
      <main id="main-content" className="workspace-main">
        <div
          className="workspace-mobile-tabs"
          role="tablist"
          aria-label="Workspace pane"
        >
          {(focus ? ["SQL", "Result"] : layout === "Note-taking" ? ["Problem", "SQL", "Result", "Notes"] : ["Problem", "SQL", "Result"]).map((t) => (
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
          className={`workspace-layout layout-${layout.toLowerCase()} ${isAiPanelOpen ? "with-ai" : ""}`}
          style={{
            "--problem-pane-width": `${problemWidth}%`,
            "--middle-pane-width": `${secondBoundary - problemWidth}%`,
            "--last-pane-width": `${100 - secondBoundary}%`,
            "--editor-pane-height": `${editorHeight}%`,
          } as CSSProperties}
        >
          <section
            id="workspace-problem-pane"
            className={
              "problem-pane mobile-pane" +
              (mobileTab === "Problem" ? " mobile-visible" : "")
            }
            aria-label="Problem description"
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
                  {problem.expected && <><h3>Expected output</h3><DataGrid table={problem.expected} /><p className="tiny muted">Output shown for the sample dataset.</p></>}
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
                                <thead><tr><th>Column</th><th>Type</th><th>Constraints</th></tr></thead>
                                <tbody>{table.columns.map((column) => (
                                  <tr key={column.name}>
                                    <th scope="row">{column.name}</th>
                                    <td>{column.type}</td>
                                    <td>{column.constraints || "—"}</td>
                                  </tr>
                                ))}</tbody>
                              </table>
                            </div>
                            {(table.foreignKeys.length > 0 || table.constraints.length > 0) && <div className="workspace-schema-relations">
                              {table.foreignKeys.map((foreignKey, index) => (
                                <div className="workspace-schema-relation" key={`fk-${index}`}>
                                  <span className="workspace-schema-relation-label">FOREIGN KEY</span>
                                  <code>{foreignKey.columns.join(", ")}</code>
                                  <span aria-hidden="true">→</span>
                                  <code>{foreignKey.referencedTable}.{foreignKey.referencedColumns.join(", ")}</code>
                                </div>
                              ))}
                              {table.constraints.map((constraint, index) => (
                                <span className="workspace-schema-extra-constraint" key={`constraint-${index}`}>{constraint}</span>
                              ))}
                            </div>}
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
                                <thead><tr>{table.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
                                <tbody>{table.rows.map((row, rowIndex) => (
                                  <tr key={rowIndex}>{row.map((value, columnIndex) => <td key={`${table.columns[columnIndex]}-${columnIndex}`}>{value}</td>)}</tr>
                                ))}</tbody>
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
                  <small className="muted">
                    Guidance only · no complete solution.
                  </small>
                </section>
              </div>
            </div>
            <div className="help-dock">
              <button
                ref={helpTrigger}
                disabled={contestMode}
                aria-expanded={!!help}
                aria-controls="workspace-hint-panel"
                title={
                  contestMode ? "Hints are disabled during contests" : undefined
                }
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
                title={
                  !contestAiAllowed
                    ? "AI assistance is disabled during contests"
                    : undefined
                }
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
          <div
            className="workspace-splitter workspace-splitter-vertical"
            role="separator"
            aria-label="Resize problem and editor panes"
            aria-orientation="vertical"
            aria-controls="workspace-problem-pane workspace-editor-results"
            aria-valuemin={MIN_PROBLEM_WIDTH}
            aria-valuemax={layout === "Default" ? MAX_PROBLEM_WIDTH : secondBoundary - 26}
            aria-valuenow={Math.round(problemWidth)}
            aria-valuetext={`Problem pane ${Math.round(problemWidth)} percent`}
            tabIndex={0}
            onPointerDown={(event) => startResize("vertical", event)}
            onPointerMove={(event) => moveResize("vertical", event)}
            onPointerUp={stopResize}
            onPointerCancel={stopResize}
            onLostPointerCapture={() => {
              activeResize.current = null;
              setResizing(null);
            }}
            onDoubleClick={() => setProblemWidth(clampPaneSize(defaults[layout].problemWidth, MIN_PROBLEM_WIDTH, layout === "Default" ? MAX_PROBLEM_WIDTH : secondBoundary - 26))}
            onKeyDown={(event) => resizeWithKeyboard("vertical", event)}
          />
          <div id="workspace-editor-results" className="editor-results" ref={editorResults}>
            <section
              id="workspace-editor-pane"
              className={
                "editor-pane mobile-pane" +
                (mobileTab === "SQL" ? " mobile-visible" : "")
              }
              aria-label="SQL editor"
            >
              <div className="editor-toolbar">
                <span className="editor-dialect">SQL Server</span>
                <button className="icon-button" type="button" aria-label="Reset SQL query" title="Reset SQL query" onClick={() => setConfirmResetQuery(true)}><RotateCcw size={16} /></button>
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
                        changes: indentRange(
                          view.state,
                          0,
                          view.state.doc.length,
                        ),
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
                  aria-label={
                    expanded ? "Restore editor layout" : "Expand SQL editor"
                  }
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
                  extensions={[
                    sql({ dialect: MSSQL }),
                    editorTheme,
                  ]}
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
                  title={
                    !selected.trim()
                      ? "Select SQL text in the editor first"
                      : undefined
                  }
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
                    : contestClosed ? "Submissions closed" : "Submit"}
                </button>
              </div>
            </section>
            <div
              className={`workspace-splitter editor-result-splitter workspace-splitter-${threeColumns ? "vertical" : "horizontal"}`}
              role="separator"
              aria-label="Resize editor and result panes"
              aria-orientation={threeColumns ? "vertical" : "horizontal"}
              aria-controls="workspace-editor-pane workspace-result-pane"
              aria-valuemin={threeColumns ? problemWidth + 26 : MIN_EDITOR_HEIGHT}
              aria-valuemax={threeColumns ? 82 : MAX_EDITOR_HEIGHT}
              aria-valuenow={Math.round(threeColumns ? secondBoundary : editorHeight)}
              aria-valuetext={`${threeColumns ? "Column boundary" : "Editor height"} ${Math.round(threeColumns ? secondBoundary : editorHeight)} percent`}
              tabIndex={0}
              onPointerDown={(event) => startResize(threeColumns ? "secondary" : "horizontal", event)}
              onPointerMove={(event) => moveResize(threeColumns ? "secondary" : "horizontal", event)}
              onPointerUp={stopResize}
              onPointerCancel={stopResize}
              onLostPointerCapture={() => {
                activeResize.current = null;
                setResizing(null);
              }}
              onDoubleClick={() => threeColumns ? updateSizes({ secondBoundary: clampPaneSize(defaults[layout].secondBoundary, problemWidth + 26, 82) }) : setEditorHeight(DEFAULT_EDITOR_HEIGHT)}
              onKeyDown={(event) => resizeWithKeyboard(threeColumns ? "secondary" : "horizontal", event)}
            />
            <section
              id="workspace-result-pane"
              className={
                "result-pane mobile-pane" +
                (mobileTab === "Result" ? " mobile-visible" : "")
              }
              aria-label="Query output"
            >
              <div
                className="pane-tabs"
                role="tablist"
                aria-label="Execution output"
              >
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
              <div
                className={"result-scroll" + (!display ? " idle" : "")}
                aria-live="polite"
              >
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
                    <p className="tiny muted">{resultTab === "Submissions" ? "Submission saved to your history." : "Executed against the problem dataset."}</p>
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
                      Run the query to preview returned data. Submit when ready
                      for evaluation.
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
          </div>
          <div className="workspace-splitter workspace-splitter-vertical notes-splitter" role="separator" aria-label="Resize notes pane" aria-orientation="vertical" aria-valuemin={problemWidth + 26} aria-valuemax={82} aria-valuenow={secondBoundary} tabIndex={0}
            onPointerDown={event => startResize("secondary", event)} onPointerMove={event => moveResize("secondary", event)} onPointerUp={stopResize} onPointerCancel={stopResize}
            onLostPointerCapture={() => { activeResize.current = null; setResizing(null); }} onKeyDown={event => resizeWithKeyboard("secondary", event)} onDoubleClick={() => updateSizes({ secondBoundary: clampPaneSize(defaults[layout].secondBoundary, problemWidth + 26, 82) })} />
          <section className={`notes-pane mobile-pane${mobileTab === "Notes" ? " mobile-visible" : ""}`} aria-label="Notes">
            <div className="pane-tabs"><b>Notes</b><small className="muted">Saved locally</small></div>
            <textarea aria-label="Problem notes" placeholder="Write your approach, observations or SQL reminders..." value={notes} onChange={event => { setNotes(event.target.value); storage.set(notesKey, event.target.value); }} />
          </section>
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
      {confirmResetQuery && <Dialog title="Reset SQL query?" onClose={() => setConfirmResetQuery(false)}><p>Your current SQL draft will be cleared from this browser.</p><div className="dialog-actions"><button className="button" type="button" onClick={() => setConfirmResetQuery(false)}>Cancel</button><button className="button primary" type="button" onClick={() => { setCode(""); setResult(null); setLastSubmit(null); setConfirmResetQuery(false); }}>Clear query</button></div></Dialog>}
    </div>
  );
}
