import Link from "next/link";
import { Layers2 } from "lucide-react";

export function Brand({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link
      className={`brand${inverse ? " brand-inverse" : ""}`}
      href="/"
      aria-label="Emissor, início"
    >
      <span className="brand-mark">
        <Layers2 size={22} strokeWidth={1.7} aria-hidden="true" />
      </span>
      emissor<span className="brand-period">.</span>
    </Link>
  );
}
