import type { ComponentProps } from "react";

export default function PreviewLink(props: ComponentProps<"a"> & { prefetch?: boolean | null }) {
  const anchor = { ...props };
  delete anchor.prefetch;
  return <a {...anchor} />;
}
