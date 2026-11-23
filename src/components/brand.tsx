import Link from "next/link";

export function Brand({ inverse = false, href = "/" }: { inverse?: boolean; href?: string }) {
  return (
    <Link className={`brand rex-brand${inverse ? " rex-brand--inverse" : ""}`} href={href} aria-label="Rex Notas, início">
      <span aria-hidden="true" />
    </Link>
  );
}
