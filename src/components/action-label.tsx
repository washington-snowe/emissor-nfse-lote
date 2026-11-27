export function ActionLabel({ pending, idle, busy }: { pending: boolean; idle: string; busy: string }) {
  return <span className="action-label" data-pending={pending}>
    <span aria-hidden="true">{idle}</span>
    <span aria-hidden="true">{busy}</span>
    <span className="sr-only">{pending ? busy : idle}</span>
  </span>;
}
