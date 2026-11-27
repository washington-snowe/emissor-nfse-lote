export default function WorkspaceLoading() {
  return <div className="dashboard-content workspace-loading-content" role="status" aria-label="Carregando página">
    <span className="sr-only">Carregando os dados desta página…</span>
    <div className="skeleton skeleton--title" aria-hidden="true" />
    <div className="skeleton skeleton--line" aria-hidden="true" />
    <div className="skeleton workspace-loading-surface" aria-hidden="true" />
  </div>;
}
