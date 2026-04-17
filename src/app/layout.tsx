import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "roofing.sydney — See your new Colorbond roof before you commit",
  description:
    "Pick a Colorbond colour and see a realistic preview on your actual Sydney home. Free aerial visualisation, free quote, no obligation.",
  metadataBase: new URL("https://roofing.sydney"),
  openGraph: {
    title: "See your new Colorbond roof before you commit",
    description:
      "Pick a colour. See it on your actual roof. Book a free quote.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-AU">
      <body className={`${inter.variable} antialiased`}>{children}</body>
    </html>
  );
}
