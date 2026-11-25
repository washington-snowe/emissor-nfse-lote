export default function WorkspaceLoading() {
  return <div className="workspace-loading" role="status">
    <span className="sr-only">Carregando seu painel…</span>
    <div className="workspace-loading-nav" aria-hidden="true">
      <div className="skeleton skeleton--title" />
      <div className="skeleton skeleton--control" />
      <div className="skeleton skeleton--line" />
      <div className="skeleton skeleton--line" />
      <div className="skeleton skeleton--line" />
    </div>
    <main id="conteudo" aria-hidden="true">
      <div className="workspace-loading-bar"><div className="skeleton skeleton--line" /></div>
      <div className="dashboard-content workspace-loading-content">
        <div className="skeleton skeleton--title" />
        <div className="skeleton skeleton--line" />
        <div className="skeleton workspace-loading-surface" />
      </div>
    </main>
  </div>;
}
