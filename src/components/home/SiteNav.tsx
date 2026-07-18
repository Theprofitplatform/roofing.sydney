"use client";

import { useState } from "react";
import Link from "next/link";

const LINKS = [
  { href: "#services", label: "Services" },
  { href: "#visualiser", label: "Colour visualiser" },
  { href: "#process", label: "Process" },
  { href: "#areas", label: "Service areas" },
];

/** Sticky site nav with a working mobile hamburger + slide-down menu and a
 *  persistent "Free quote" CTA that stays visible at every breakpoint. */
export function SiteNav() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <nav>
      <div className="wrap navin">
        <Link className="logo" href="/" aria-label="Australian Roofing Contractors — home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="logoimg" src="/images/logo.png" alt="ARC — Australian Roofing Contractors" />
        </Link>

        <div id="primary-nav" className={open ? "navlinks open" : "navlinks"}>
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={close}>
              {l.label}
            </a>
          ))}
          <a className="btn btn-primary navlink-cta" href="#quote" onClick={close}>
            Free quote
          </a>
        </div>

        <div className="navmobile">
          <a className="btn btn-primary navcta" href="#quote">
            Free quote
          </a>
          <button
            type="button"
            className="navtoggle"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="primary-nav"
            onClick={() => setOpen((v) => !v)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>
    </nav>
  );
}
