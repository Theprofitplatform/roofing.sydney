import "./redesign.css";
import Link from "next/link";
import { Barlow, Barlow_Condensed, JetBrains_Mono } from "next/font/google";
import { SiteNav } from "@/components/home/SiteNav";
import { HeroSlideshow } from "@/components/home/HeroSlideshow";
import { HouseColourViz } from "@/components/home/HouseColourViz";
import { QuoteForm } from "@/components/home/QuoteForm";

const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

const HERO_SLIDES = [
  { src: "/images/titanium-zinc.jpg", alt: "New Colorbond metal roof under a blue Sydney sky" },
  { src: "/images/metal-install-2.jpg", alt: "Finished metal roof installation in Sydney" },
  { src: "/images/galvalume-install.jpg", alt: "Re-roofing in progress with edge protection" },
  { src: "/images/stone-coated-steel.jpg", alt: "Completed residential metal re-roof" },
  { src: "/images/metal-shingle.jpg", alt: "Metal roofing detail work by our Sydney crew" },
];

const AREAS = [
  "Oatley",
  "Hurstville",
  "Sans Souci",
  "Cronulla",
  "Woolooware",
  "Maroubra",
  "Randwick",
  "Clovelly",
  "Glebe",
  "Annandale",
];

export default function Home() {
  return (
    <div className={`arc ${barlow.variable} ${barlowCondensed.variable} ${jetbrains.variable}`}>
      {/* nav */}
      <SiteNav />

      {/* hero */}
      <header className="hero">
        <HeroSlideshow slides={HERO_SLIDES} />
        <div className="herotag">
          <b>Fixed-price quotes</b>
          <br />
          In writing, within 48 hours
        </div>
        <div className="wrap">
          <div className="herocontent">
            <h1>
              See your new roof <em>before</em> you pay for it.
            </h1>
            <p className="lead">
              Sydney&apos;s metal roofing specialists. Colorbond® re-roofing, leak repairs and
              gutters — with a colour preview on a real roof so you commit with confidence, not
              guesswork.
            </p>
            <div className="heroctas">
              <a className="btn btn-primary" href="#visualiser">
                Try the colour visualiser
              </a>
              <a className="btn btn-ghost" href="#quote">
                Book an inspection
              </a>
            </div>
            <div className="stats">
              <div className="stat">
                <div className="n">150+</div>
                <div className="l">Sydney roofs since 2011</div>
              </div>
              <div className="stat">
                <div className="n">6 yr</div>
                <div className="l">Workmanship warranty</div>
              </div>
              <div className="stat">
                <div className="n">$20M</div>
                <div className="l">Public liability cover</div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* trust bar */}
      <div className="trust">
        <div className="wrap">
          <span>
            <b>NSW Fair Trading</b> Lic. 245723C
          </span>
          <span>
            <b>BlueScope Colorbond®</b> Accredited Installer
          </span>
          <span>
            <b>$20M</b> Public Liability (Hollard)
          </span>
          <span>
            <b>NSW Home Warranty</b> Insured
          </span>
          <span>ABN 59 148 109 399</span>
        </div>
      </div>

      {/* visualiser */}
      <section className="vis" id="visualiser">
        <div className="wrap">
          <HouseColourViz />
        </div>
      </section>

      {/* services */}
      <section id="services">
        <div className="wrap">
          <span className="kicker">02 — Services</span>
          <h2 className="h2">
            Roofing built for <em>Australian conditions.</em>
          </h2>
          <p className="sub">
            Cyclonic wind zones. UV extremes. Bushfire overlays. Salt spray off the coast. Every
            roof we build is specified for the climate it lives in.
          </p>
          <div className="cards">
            <div className="card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="photo" src="/images/galvalume-install.jpg" alt="Colorbond re-roofing in progress in Sydney" />
              <div className="cardbody">
                <span className="cardnum">/01</span>
                <h3>Colorbond re-roofing</h3>
                <p>
                  Full metal roof replacements in Colorbond® steel — all 22 standard colours plus
                  Ultra and Matt finishes, matched to your home and climate zone.
                </p>
                <a href="#quote">Get a Colorbond quote →</a>
              </div>
            </div>
            <div className="card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="photo" src="/images/metal-install-1.jpg" alt="Roofer inspecting a metal roof for leaks" />
              <div className="cardbody">
                <span className="cardnum">/02</span>
                <h3>Leak detection &amp; repairs</h3>
                <p>
                  Same-week response across Greater Sydney. Thermal imaging finds the leak,
                  fixed-price repairs stop it — with a 12-month labour guarantee.
                </p>
                <a href="#quote">Report a leak →</a>
              </div>
            </div>
            <div className="card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="photo" src="/images/metal-shingle.jpg" alt="Gutter and downpipe work in Colorbond steel" />
              <div className="cardbody">
                <span className="cardnum">/03</span>
                <h3>Gutters &amp; downpipes</h3>
                <p>
                  Quad, Half-Round and Fascia-cover profiles, with leaf-guard systems rated for gum
                  leaves. Colour-matched to your Colorbond palette.
                </p>
                <a href="#quote">Get a gutter quote →</a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* process */}
      <section className="process" id="process">
        <div className="wrap">
          <span className="kicker">03 — Process</span>
          <h2 className="h2">
            From first call to <em>final handover.</em>
          </h2>
          <p className="sub">
            Every job runs the same way: a fixed price in writing, a locked-in start date, and one
            project manager from start to finish.
          </p>
          <div className="steps">
            <div className="step">
              <div className="n">01</div>
              <h3>On-site consult</h3>
              <p>
                A senior roofer visits within 5 working days. Drone survey, thermal scan and timber
                condition check — all included, all free.
              </p>
            </div>
            <div className="step">
              <div className="n">02</div>
              <h3>Fixed-price quote</h3>
              <p>
                A written quote within 48 hours. No provisional sums, no surprises — we show you
                exactly what&apos;s replaced and why.
              </p>
            </div>
            <div className="step">
              <div className="n">03</div>
              <h3>Installation</h3>
              <p>
                Most Sydney homes finish in 3–5 working days, with daily site photos sent straight
                to your phone.
              </p>
            </div>
            <div className="step">
              <div className="n">04</div>
              <h3>Final handover</h3>
              <p>
                Joint inspection, NSW Fair Trading compliance certificate, and a 6-year workmanship
                warranty — all in writing.
              </p>
            </div>
          </div>
          <div className="gallery">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="photo" src="/images/metal-install-2.jpg" alt="Finished metal roof with clean ridge lines" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="photo" src="/images/titanium-zinc.jpg" alt="Completed Colorbond re-roof in Sydney" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="photo" src="/images/stone-coated-steel.jpg" alt="Residential metal re-roof by our crew" />
          </div>
        </div>
      </section>

      {/* areas */}
      <section className="areas" id="areas">
        <div className="wrap">
          <div>
            <span className="kicker">04 — Where we work</span>
            <h2 className="h2">
              The Sydney suburbs <em>we know best.</em>
            </h2>
            <p className="sub">
              Eastern Suburbs, Inner West and St George — plus surrounds. Postcode not listed? Call
              us and we&apos;ll tell you straight whether we can help.
            </p>
            <p className="nocover">
              <b>Areas we don&apos;t cover:</b> Northern Beaches, Western Sydney, Wollongong. We
              keep our patch tight so response times stay fast and quality stays consistent.
            </p>
          </div>
          <div>
            <p className="mono" style={{ color: "var(--ink2)", marginTop: 8 }}>
              Primary service areas
            </p>
            <div className="chipsgrid">
              {AREAS.map((a) => (
                <span key={a} className="areachip">
                  {a}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* quote */}
      <section className="quote" id="quote">
        <div className="wrap">
          <div>
            <span className="kicker">05 — Free quote</span>
            <h2 className="h2">
              Honest pricing, in writing, <em>within 48 hours.</em>
            </h2>
            <p className="sub">
              Every quote includes a drone roof survey, a fixed price, material breakdown, project
              timeline and our warranty terms — on paper.
            </p>
            <ul className="ticks">
              <li>
                <span className="tick">✓</span>Site inspection within 5 working days
              </li>
              <li>
                <span className="tick">✓</span>Written fixed-price quote — no provisional sums
              </li>
              <li>
                <span className="tick">✓</span>Zero obligation, no deposit to quote
              </li>
              <li>
                <span className="tick">✓</span>6-year workmanship warranty · 25-year materials
              </li>
            </ul>
          </div>
          <QuoteForm />
        </div>
      </section>

      {/* footer */}
      <footer>
        <div className="wrap">
          <div>
            <Link className="logo" href="/" aria-label="Australian Roofing Contractors — home" style={{ color: "#fff" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="logoimg" src="/images/logo.png" alt="ARC — Australian Roofing Contractors" />
            </Link>
            <p style={{ marginTop: 18, maxWidth: 340 }}>
              Sydney metal roofing specialists since 2011. Colorbond® and standing seam
              re-roofing, leak repairs and gutters — friendly service from quote to handover.
            </p>
          </div>
          <div>
            <h4>Services</h4>
            <ul>
              <li>
                <a href="#quote">Colorbond re-roofing</a>
              </li>
              <li>
                <a href="#quote">Leak detection &amp; repairs</a>
              </li>
              <li>
                <a href="#quote">Gutters &amp; downpipes</a>
              </li>
              <li>
                <a href="#quote">Standing seam (Copper / Zinc / Aluminium)</a>
              </li>
              <li>
                <a href="#quote">Commercial roofing</a>
              </li>
            </ul>
          </div>
          <div>
            <h4>Company</h4>
            <ul>
              <li>
                <a href="#visualiser">Colour visualiser</a>
              </li>
              <li>
                <a href="#process">Our process</a>
              </li>
              <li>
                <a href="#areas">Service areas</a>
              </li>
              <li>
                <Link href="/about">About</Link>
              </li>
              <li>
                <Link href="/contact">Contact</Link>
              </li>
              <li>
                <a href="tel:0281034001">02 8103 4001</a>
              </li>
              <li>
                <a href="mailto:hello@roofing.sydney">hello@roofing.sydney</a>
              </li>
            </ul>
          </div>
        </div>
        <div className="wrap fbottom">
          <span>© 2026 Australian Roofing Contractors Pty Ltd · NSW Fair Trading Lic. 245723C</span>
          <span>ABN 59 148 109 399</span>
        </div>
      </footer>
    </div>
  );
}
