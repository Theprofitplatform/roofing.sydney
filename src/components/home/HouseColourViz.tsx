"use client";

import { useState } from "react";
import Link from "next/link";

type Swatch = { name: string; hex: string; img: string };

const SWATCHES: Swatch[] = [
  { name: "Current", hex: "#7A7975", img: "/images/titanium-zinc-hero.jpeg" },
  { name: "Basalt", hex: "#3B3B3B", img: "/images/titanium-zinc-basalt.jpeg" },
  { name: "Surfmist", hex: "#EFECE1", img: "/images/titanium-zinc-surfmist.jpeg" },
  { name: "Manor Red", hex: "#9D4236", img: "/images/titanium-zinc-manor-red.jpeg" },
  { name: "Woodland", hex: "#4C5457", img: "/images/titanium-zinc-woodland.jpeg" },
  { name: "Jasper", hex: "#6A6F59", img: "/images/titanium-zinc-jasper.jpeg" },
];

/** Renders both columns of the `.vis` section grid: copy + swatches, then a real-photo
 *  roof preview (each swatch has a matched render of the same home). */
export function HouseColourViz() {
  const [active, setActive] = useState(0);
  const swatch = SWATCHES[active];

  return (
    <>
      <div>
        <span className="kicker">01 — Colour visualiser</span>
        <h2 className="h2">
          Pick a Colorbond shade. <em>Watch it change.</em>
        </h2>
        <p className="sub">
          Choosing a roof colour from a tiny paint chip is a gamble. Tap a shade below and see it
          on a whole roof — then preview it on satellite imagery of your actual home.
        </p>
        <div className="swatches">
          {SWATCHES.map((s, i) => (
            <button
              key={s.name}
              type="button"
              className={i === active ? "sw active" : "sw"}
              aria-pressed={i === active}
              aria-label={`Preview ${s.name}`}
              onClick={() => setActive(i)}
            >
              <div className="chip" style={{ background: s.hex }} />
              <div className="nm">{s.name}</div>
            </button>
          ))}
        </div>
        <p style={{ marginTop: 26 }}>
          <Link className="btn btn-primary" href="/preview">
            Preview it on my home →
          </Link>
        </p>
      </div>
      <div className="house-stage house-stage--photo">
        <span className="vislabel">LIVE PREVIEW</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={swatch.img} alt={`Home with ${swatch.name} Colorbond roof`} />
        <span className="vistag" aria-live="polite">
          {swatch.name} · preview
        </span>
      </div>
    </>
  );
}
