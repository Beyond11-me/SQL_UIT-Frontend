import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { studentApi } from "../../services/studentApi";
import { useLoad } from "../../components/useLoad";
import { ProblemMarkdown } from "../../components/ProblemMarkdown";
import { Dialog, Empty, ErrorState, Loading, Status } from "../../components/ui";
import {
  PracticeActivity,
  PracticeTrending,
} from "../../components/PracticeSidebar";

type PracticeProblemSummary = { id: string; number: string | number; title: string; topic?: string; topics?: string[]; difficulty: string; progress: string };

function PracticeProblemDetails({ problem }: { problem: PracticeProblemSummary }) {
  const { data, loading, error } = useLoad(() => studentApi.getProblem(problem.id), [problem.id]);
  const topics = Array.isArray(problem.topics) && problem.topics.length ? problem.topics.join(" · ") : problem.topic || "—";
  return <div className="practice-problem-details-layout">
    <div className="practice-sidebar-problem-scroll">
      <article className="practice-selected-problem">
        <span className="practice-detail-eyebrow">PROBLEM DETAILS</span>
        <h2>{problem.number} · {problem.title}</h2>
        <div className="practice-selected-meta"><Status value={problem.progress || "Not started"} /><span>{problem.difficulty}</span></div>
        <dl className="practice-selected-facts"><div><dt>Topic</dt><dd>{topics}</dd></div></dl>
        {loading ? <p className="muted" role="status">Loading problem information…</p> : error ? <p className="muted" role="alert">Could not load the full problem description.</p> : <>
          {data?.description && <section className="practice-selected-description"><h3>About this problem</h3><ProblemMarkdown>{data.description}</ProblemMarkdown></section>}
          {data?.requirements && <section className="practice-selected-description"><h3>Requirements</h3><ProblemMarkdown>{data.requirements}</ProblemMarkdown></section>}
          {data?.databaseType && <p className="muted">Database · {data.databaseType}</p>}
        </>}
      </article>
    </div>
    <Link className="button primary practice-solve-button" to={`/workspace/${encodeURIComponent(problem.id)}`}>Solve problem →</Link>
  </div>;
}

const PAGE_SIZE = 15;

function paginationItems(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const visible = new Set([1, total, current - 1, current, current + 1]);
  if (current <= 3) [2, 3, 4, 5].forEach((page) => visible.add(page));
  if (current >= total - 2) [total - 4, total - 3, total - 2, total - 1].forEach((page) => visible.add(page));
  const pages = [...visible].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
  const items: (number | "ellipsis")[] = [];
  pages.forEach((page, index) => {
    const gap = page - (pages[index - 1] || 0);
    if (index && gap === 2) items.push(page - 1);
    if (index && gap > 2) items.push("ellipsis");
    items.push(page);
  });
  return items;
}

export function PracticePage() {
  const [search, setSearch] = useState("");
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [progress, setProgress] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [filterDialog, setFilterDialog] = useState(false);
  const [pendingFilters, setPendingFilters] = useState({
    topic: "",
    difficulty: "",
    progress: "",
  });
  const [page, setPage] = useState(1);
  const [selectedProblemId, setSelectedProblemId] = useState("");
  const [sidebarTab, setSidebarTab] = useState<"activity" | "problem">("activity");
  const activityMonth = new Date().toLocaleString("default", { month: "long" });
  const resultsStartRef = useRef<HTMLDivElement | null>(null);

  const { data: prefData, loading: prefLoading, error: prefError } = useLoad(
    studentApi.getPreferences,
  );
  const { data: dashData, loading: dashLoading, error: dashError } = useLoad(studentApi.getDashboard);
  const { data: catalogData, loading: catalogLoading, error: catalogError } = useLoad(studentApi.getProblems);
  const topics = [...new Set((catalogData || []).flatMap((problem) =>
    (Array.isArray(problem.topics) ? problem.topics : String(problem.topic || "").split(","))
      .map((value: string) => value.trim()).filter(Boolean),
  ))].sort();

  const favoriteIds = prefData?.favorites || [];
  const favoriteProblems = (catalogData || []).filter((problem: any) => favoriteIds.includes(problem.id));

  const {
    data: rawProblems,
    loading,
    error,
  } = useLoad(
    async () =>
      await studentApi.getProblems({
        search,
        topic,
        difficulty,
        progress,
        includeTrending: true,
      }),
    [search, topic, difficulty, progress],
  );

  const data =
    rawProblems?.filter(
      (p) => !favoritesOnly || favoriteIds.includes(p.id),
    ) || [];
  const pageCount = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const firstIndex = (currentPage - 1) * PAGE_SIZE;
  const pageProblems = data.slice(firstIndex, firstIndex + PAGE_SIZE);
  const selectedProblem = pageProblems.find((problem) => problem.id === selectedProblemId);

  useEffect(() => {
    setPage(1);
    setSelectedProblemId("");
    setSidebarTab("activity");
    resultsStartRef.current?.scrollTo({ top: 0 });
  }, [search, topic, difficulty, progress, favoritesOnly]);
  function goToPage(nextPage: number) {
    if (nextPage < 1 || nextPage > pageCount || nextPage === currentPage) return;
    setPage(nextPage);
    requestAnimationFrame(() => {
      resultsStartRef.current?.scrollTo({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        top: 0,
      });
    });
  }
  function clear() {
    setSearch("");
    setTopic("");
    setDifficulty("");
    setProgress("");
    setFavoritesOnly(false);
  }
  return (
    <section className="page practice-page compact-tables-page compact-student-practice" aria-label="Practice problems">
      <h1 className="sr-only">Practice</h1>
      <div className="practice-layout">
        <div className="practice-main">
          <div className="filters">
            <label className="field search-field">
              Search
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by title or problem ID"
              />
            </label>
            <label className="field practice-desktop-filter">
              Topic
              <select value={topic} onChange={(e) => setTopic(e.target.value)}>
                <option value="">All</option>
                {topics.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="field practice-desktop-filter">
              Difficulty
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
              >
                <option value="">All</option>
                {["Easy", "Medium", "Hard"].map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
            <label className="field practice-desktop-filter">
              Status
              <select
                value={progress}
                onChange={(e) => setProgress(e.target.value)}
              >
                <option value="">All</option>
                {["Solved", "In progress", "Not started"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="practice-mobile-actions">
            <button
              className="button"
              onClick={() => {
                setPendingFilters({ topic, difficulty, progress });
                setFilterDialog(true);
              }}
            >
              Filters
              {[topic, difficulty, progress].filter(Boolean).length
                ? " · " + [topic, difficulty, progress].filter(Boolean).length
                : ""}
            </button>
            <select
              className="practice-mobile-list-select"
              aria-label="Choose problem filter"
              value={favoritesOnly ? "favorites" : ""}
              onChange={(event) => {
                setFavoritesOnly(event.target.value === "favorites");
              }}
            >
              <option value="">All problems</option>
              <option value="favorites" disabled={prefLoading || !!prefError}>Saved</option>
            </select>
          </div>
          <div className="problem-list" aria-busy={loading}>
            <div className="practice-problem-scroll" ref={resultsStartRef}>
            {prefError && favoritesOnly && <p role="alert">Could not load saved problems.</p>}
            {loading && rawProblems && (
              <span className="sr-only" role="status">
                Updating problem results…
              </span>
            )}
            {loading && !rawProblems ? (
              <Loading />
            ) : error ? (
              <ErrorState title="Could not load problems" message={error} onRetry={() => window.location.reload()} />
            ) : !data?.length ? (
              <Empty
                title={
                  catalogData?.length
                    ? "No matching problems"
                    : "No problems available"
                }
              >
                Try another search or filter.{" "}
                <button className="text-button" onClick={clear}>
                  Clear filters
                </button>
              </Empty>
            ) : (
              <>
                <div className="problem-list-heading">
                  <span>ID</span>
                  <b>Problem</b>
                  <span>Topic</span>
                  <span>Difficulty</span>
                  <span>Status</span>
                </div>
                {pageProblems.map((p) => (
                  <button
                    type="button"
                    className={`problem-row${selectedProblemId === p.id ? " is-selected" : ""}`}
                    key={p.id}
                    aria-pressed={selectedProblemId === p.id}
                    onClick={() => {
                      setSelectedProblemId(p.id);
                      setSidebarTab("problem");
                    }}
                  >
                    <span className="problem-number muted">{p.number}</span>
                    <b>{p.title}</b>
                    <div className="problem-details">
                      <span className="problem-topic">{Array.isArray(p.topics) && p.topics.length ? p.topics.join(" · ") : p.topic || "—"}</span>
                      <span
                        className={"difficulty " + p.difficulty.toLowerCase()}
                      >
                        {p.difficulty}
                      </span>
                    </div>
                    <Status value={p.progress} />
                  </button>
                ))}

              </>
            )}
            </div>
            {!error && data.length > 0 && (
                <div className="practice-results-footer">
                  <p aria-live="polite">Showing {firstIndex + 1}–{Math.min(firstIndex + PAGE_SIZE, data.length)} of {data.length} problems</p>
                  <nav className="practice-pagination" aria-label="Problem pages">
                    <button type="button" disabled={currentPage === 1} onClick={() => goToPage(currentPage - 1)}>← Previous</button>
                    <span className="practice-pagination-pages">
                      {paginationItems(currentPage, pageCount).map((item, index) => item === "ellipsis"
                        ? <span className="practice-pagination-ellipsis" aria-hidden="true" key={`ellipsis-${index}`}>…</span>
                        : <button type="button" key={item} aria-label={`Page ${item}`} aria-current={currentPage === item ? "page" : undefined} onClick={() => goToPage(item)}>{item}</button>)}
                    </span>
                    <span className="practice-pagination-mobile">Page {currentPage} of {pageCount}</span>
                    <button type="button" disabled={currentPage === pageCount} onClick={() => goToPage(currentPage + 1)}>Next →</button>
                  </nav>
                </div>
            )}
          </div>
        </div>
        <aside className="practice-sidebar">
          <div className="practice-sidebar-heading">
            <h3>{sidebarTab === "activity" ? `${activityMonth} activity` : "Problem details"}</h3>
            <span className="practice-sidebar-tabs" role="tablist" aria-label="Practice sidebar">
              <span className={`practice-sidebar-tab-indicator${sidebarTab === "problem" ? " is-problem" : ""}`} aria-hidden="true" />
              <button type="button" role="tab" id="practice-activity-tab" aria-selected={sidebarTab === "activity"} aria-controls="practice-activity-panel" onClick={() => setSidebarTab("activity")}>Activity</button>
              <button type="button" role="tab" id="practice-problem-tab" aria-selected={sidebarTab === "problem"} aria-controls="practice-problem-panel" disabled={!selectedProblem} onClick={() => selectedProblem && setSidebarTab("problem")}>Problem</button>
            </span>
          </div>
          <div className="practice-sidebar-views">
            <div id="practice-activity-panel" role="tabpanel" aria-labelledby="practice-activity-tab" className="practice-sidebar-view practice-sidebar-activity" hidden={sidebarTab !== "activity"}>
              <PracticeActivity submissions={dashData?.submissionsPerDay || []} />
              {dashLoading && <Loading label="Loading activity…" />}
              {dashError && <p role="alert">Could not load activity.</p>}
              <PracticeTrending
                favoriteProblems={favoriteProblems}
                favoriteLoading={prefLoading || catalogLoading}
                favoriteError={!!prefError || !!catalogError}
              />
            </div>
            <div id="practice-problem-panel" role="tabpanel" aria-labelledby="practice-problem-tab" className="practice-sidebar-view practice-sidebar-problem" hidden={sidebarTab !== "problem"}>
              {selectedProblem ? <PracticeProblemDetails key={selectedProblem.id} problem={selectedProblem} /> : <p className="muted">Choose a problem from the table to see its details here.</p>}
            </div>
          </div>
        </aside>
      </div>
      {filterDialog && (
        <Dialog
          title="Filters"
          className="practice-filter-dialog"
          onClose={() => setFilterDialog(false)}
        >
          <div className="practice-filter-fields">
            {[
              {
                label: "Topic",
                key: "topic" as const,
                values: topics,
              },
              {
                label: "Difficulty",
                key: "difficulty" as const,
                values: ["Easy", "Medium", "Hard"],
              },
              {
                label: "Status",
                key: "progress" as const,
                values: ["Solved", "In progress", "Not started"],
              },
            ].map((field) => (
              <label className="field" key={field.key}>
                {field.label}
                <select
                  value={pendingFilters[field.key]}
                  onChange={(e) =>
                    setPendingFilters((value) => ({
                      ...value,
                      [field.key]: e.target.value,
                    }))
                  }
                >
                  <option value="">All</option>
                  {field.values.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="dialog-actions">
            <button
              className="button"
              onClick={() =>
                setPendingFilters({ topic: "", difficulty: "", progress: "" })
              }
            >
              Clear filters
            </button>
            <button
              className="button primary"
              onClick={() => {
                setTopic(pendingFilters.topic);
                setDifficulty(pendingFilters.difficulty);
                setProgress(pendingFilters.progress);
                setFilterDialog(false);
              }}
            >
              Apply
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
