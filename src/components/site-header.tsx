import Link from "next/link";
import Image from "next/image";
import { ThemeToggle } from "@/components/ThemeToggle";

const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "Services", href: "/#services" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/80 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/images/logo.png" alt="Australian Roofing Contractors" width={48} height={48} className="object-contain" />
          <span className="text-sm font-semibold tracking-tight text-foreground">
            Australian Roofing Contractors
          </span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm lg:flex">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} className="text-muted transition-colors hover:text-foreground">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          {process.env.NEXT_PUBLIC_CONTACT_PHONE && (
            <a
              href={`tel:${process.env.NEXT_PUBLIC_CONTACT_PHONE.replace(/[\s()]/g, "")}`}
              className="hidden text-sm text-muted hover:text-foreground sm:block"
            >
              {process.env.NEXT_PUBLIC_CONTACT_PHONE}
            </a>
          )}
          <Link
            href="/#quote"
            className="rounded-full border border-border bg-background px-3.5 py-1.5 text-xs font-medium text-foreground hover:bg-surface"
          >
            Free quote
          </Link>
        </div>
      </div>
    </header>
  );
}
