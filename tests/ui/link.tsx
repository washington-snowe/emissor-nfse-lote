import type { ComponentProps } from "react";
export default function Link(props: ComponentProps<"a"> & { prefetch?: boolean }) {
  const anchor = { ...props };
  delete anchor.prefetch;
  return <a {...anchor} />;
}
export function useLinkStatus() { return { pending: false }; }
