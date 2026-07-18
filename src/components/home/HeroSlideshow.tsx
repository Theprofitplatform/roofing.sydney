"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const INTERVAL_MS = 4500;

type Slide = {
  src: string;
  alt: string;
};

type Props = {
  slides: Slide[];
};

export function HeroSlideshow({ slides }: Props) {
  const [current, setCurrent] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const restart = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(
      () => setCurrent((c) => (c + 1) % slides.length),
      INTERVAL_MS,
    );
  }, [slides.length]);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduced) restart();
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [restart]);

  const go = (i: number) => {
    setCurrent(((i % slides.length) + slides.length) % slides.length);
    restart();
  };

  return (
    <>
      <div className="slideshow">
        {slides.map((s, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={s.src}
            className={i === current ? "on" : undefined}
            src={s.src}
            alt={s.alt}
            aria-hidden={i !== current}
          />
        ))}
      </div>
      <div className="heronav">
        <button className="slidenav" aria-label="Previous photo" onClick={() => go(current - 1)}>
          ‹
        </button>
        <div className="dots">
          {slides.map((s, i) => (
            <button
              key={s.src}
              className={i === current ? "dot on" : "dot"}
              aria-label={`Photo ${i + 1}`}
              aria-current={i === current}
              onClick={() => go(i)}
            />
          ))}
        </div>
        <button className="slidenav" aria-label="Next photo" onClick={() => go(current + 1)}>
          ›
        </button>
      </div>
    </>
  );
}
