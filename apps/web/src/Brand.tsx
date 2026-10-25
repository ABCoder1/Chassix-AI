export function Brand() {
  return <a href="#" className="brand" aria-label="ChassiX AI workstation">
    <svg className="brand-monogram" viewBox="0 0 40 40" aria-hidden="true">
      <path d="M20 4a16 16 0 0 0 0 32M20 10a10 10 0 0 0 0 20" />
      <g transform="translate(18 5) scale(.77 1)">
        <path d="M3 3C3 11 21 19 21 27M21 3C21 11 3 19 3 27" />
        <path className="dna-rungs" d="M4 6H20M7 10H17M7 20H17M4 24H20" />
      </g>
    </svg>
    <span className="brand-wordmark">Chassi<svg className="brand-dna" viewBox="0 0 24 30" aria-hidden="true">
      <path d="M3 3C3 11 21 19 21 27M21 3C21 11 3 19 3 27" />
      <path className="dna-rungs" d="M4 6H20M7 10H17M7 20H17M4 24H20" />
    </svg><span className="brand-ai">AI</span></span>
  </a>;
}
