import type { ComponentPropsWithRef } from "react";
import { FileText, Upload } from "lucide-react";

export function FileControl({ file, prompt, detail, input }: {
  file: File | null;
  prompt: string;
  detail: string;
  input: Omit<ComponentPropsWithRef<"input">, "type">;
}) {
  return <div className="file-control" data-selected={Boolean(file)} data-disabled={Boolean(input.disabled)}>
    <div className="file-control-icon motion-icon-swap" data-swapped={Boolean(file)} aria-hidden="true">
      <Upload size={20} />
      <FileText size={20} />
    </div>
    <div className="file-control-copy" aria-hidden="true">
      <strong>{file ? file.name : prompt}</strong>
      <span>{file ? "Escolher outro arquivo" : detail}</span>
    </div>
    <input {...input} type="file" />
  </div>;
}
