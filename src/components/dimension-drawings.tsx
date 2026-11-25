export function DimensionFrame({ className }: { className: string }) {
  return <svg className={className} viewBox="0 0 640 580" aria-hidden="true" focusable="false">
    <g className="dimension-guides">
      <path d="M320 45v455M56 278h528" />
      <path d="M99 82h442M99 76v13m442-13v13M583 120v315m-6-315h12m-12 315h12" />
    </g>
    <path className="dimension-line" pathLength={1} d="M96 152v-32h32m384 0h32v32m0 251v32h-32m-384 0H96v-32" />
    <path className="dimension-line" pathLength={1} d="M86 218h20m-10-10v20m438 110h20m-10-10v20M310 472h20m-10-10v20" />
  </svg>;
}

const stepDiagrams = [
  {
    guides: "M13 72h154M43 10v53m92-53v53M43 13h92m-92-4v8m92-8v8",
    lines: [
      "M47 21h85a5 5 0 0 1 5 5v36a5 5 0 0 1-5 5H47a5 5 0 0 1-5-5V26a5 5 0 0 1 5-5Z",
      "M42 34h95M68 34v33m31-33v33M42 45h95M42 56h95",
      "M20 42h13m-5-5 5 5-5 5m130-5h-13m5-5-5 5 5 5",
    ],
  },
  {
    guides: "M13 72h154M35 29h110m-110-4v8m110-8v8M90 13v64",
    lines: [
      "M41 21h98a5 5 0 0 1 5 5v36a5 5 0 0 1-5 5H41a5 5 0 0 1-5-5V26a5 5 0 0 1 5-5Z",
      "M36 32h108M56 45h22m-22 11h22m-33-11h3m-3 11h3",
      "M95 48h11l5 5 12-12m-31-2h37v21H92Z",
    ],
  },
  {
    guides: "M13 74h154M34 53V25m110 18V16m-110 9 110-11M89 10v63",
    lines: [
      "M34 54 109 44l37 14-74 12Z",
      "M34 45 109 35l37 14-74 12Z",
      "M34 35 109 25l37 14-74 12Z",
      "m56 35 23-4m-14 8 33-5m9-3 8-1 13 5-8 1Z",
    ],
  },
];

export function WorkflowDrawing({ index }: { index: number }) {
  const { guides, lines } = stepDiagrams[index];
  return <svg className="landing-step-drawing" viewBox="0 0 180 82" aria-hidden="true" focusable="false">
    <path className="dimension-guides" d={guides} />
    {lines.map(line => <path className="dimension-line" pathLength={1} d={line} key={line} />)}
  </svg>;
}
