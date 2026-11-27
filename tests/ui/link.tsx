import type { ComponentProps } from "react";
export default function Link(props: ComponentProps<"a"> & { prefetch?: boolean | "auto" | null }) {
  const anchor = { ...props };
  delete anchor.prefetch;
  return <a {...anchor} />;
}
