"use client";

import { useState } from "react";

type Swatch = { name: string; hex: string; img: string };

const SWATCHES: Swatch[] = [
  { name: "Current", hex: "#7A7975", img: "/images/titanium-zinc-hero.jpeg" },
  { name: "Basalt", hex: "#3B3B3B", img: "/images/titanium-zinc-basalt.jpeg" },
  { name: "Surfmist", hex: "#EFECE1", img: "/images/titanium-zinc-surfmist.jpeg" },
  { name: "Manor Red", hex: "#9D4236", img: "/images/titanium-zinc-manor-red.jpeg" },
  { name: "Woodland", hex: "#4C5457", img: "/images/titanium-zinc-woodland.jpeg" },
  { name: "Jasper", hex: "#6A6F59", img: "/images/titanium-zinc-jasper.jpeg" },
];

const DEFAULT = SWATCHES.find((s) => s.name === "Manor Red") ?? SWATCHES[0];

export function RoofSwatchViz() {
  const [active, setActive] = useState<Swatch>(DEFAULT);

  return (
    <div className="viz">
      <div className="viz__bar">
        <div className="l">
          <span className="dot" /> Sydney Roofing · live preview
        </div>
        <span className="pill">Beta</span>
      </div>

      <div className="viz__stage">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img id="vizImg" src={active.img} alt={`Home with ${active.name} Colorbond roof`} />
        <span className="viz__tagchip">{active.name} · preview</span>
        <div className="viz__scrim">
          <div className="viz__addr">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            12 Bronte Rd, Bondi Junction NSW
          </div>
          <div className="viz__sub">Satellite view · roof recoloured in real time</div>
        </div>
      </div>

      <div className="viz__foot">
        <div className="row">
          <span className="k">All colours</span>
          <span className="k" style={{ color: "var(--ink-3)" }}>6 of 22 shades</span>
        </div>
        <div className="swatches">
          {SWATCHES.map((s) => (
            <button
              key={s.name}
              type="button"
              className={`sw${s.name === active.name ? " active" : ""}`}
              onClick={() => setActive(s)}
              aria-pressed={s.name === active.name}
              aria-label={`Preview ${s.name}`}
            >
              <span className="chip" style={{ background: s.hex }} />
              <span className="nm">{s.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
