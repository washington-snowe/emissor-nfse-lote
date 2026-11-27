import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

export function PageHeader({ title, description, back, actions }: {
  title: string;
  description?: ReactNode;
  back?: { href: string; label: string };
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      {back && <Link className="page-back" href={back.href}><ArrowLeft size={16} aria-hidden="true" />{back.label}</Link>}
      <div className="page-header-row">
        <div className="page-header-copy">
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
        {actions && <div className="page-header-actions">{actions}</div>}
      </div>
    </header>
  );
}

export function EmptyState({ icon, title, children, actions }: {
  icon: ReactNode; title: string; children?: ReactNode; actions?: ReactNode;
}) {
  return <section className="page-empty">
    <div className="page-empty-icon">{icon}</div>
    <h2>{title}</h2>
    {children && <p>{children}</p>}
    {actions && <div className="page-empty-actions">{actions}</div>}
  </section>;
}
