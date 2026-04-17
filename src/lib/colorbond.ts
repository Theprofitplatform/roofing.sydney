export type ColorbondColour = {
  id: string;
  name: string;
  /** 8-digit hex with alpha ignored; lowercase; used as fill for multiply blend. */
  hex: `#${string}`;
  /** Grouping for filters in the UI. */
  group: "light" | "neutral" | "earth" | "dark";
};

// RGB values are Bluescope's published Colorbond® approximations.
// Treat as reference — final physical colour should always be confirmed
// against the official sample booklet before purchase.
export const COLORBOND_COLOURS: ColorbondColour[] = [
  { id: "surfmist", name: "Surfmist®", hex: "#d4d2c8", group: "light" },
  { id: "classic-cream", name: "Classic Cream™", hex: "#e3d9be", group: "light" },
  { id: "paperbark", name: "Paperbark®", hex: "#cec2a6", group: "light" },
  { id: "dune", name: "Dune®", hex: "#a69d8a", group: "neutral" },
  { id: "shale-grey", name: "Shale Grey™", hex: "#b1b2ad", group: "neutral" },
  { id: "windspray", name: "Windspray®", hex: "#8f9394", group: "neutral" },
  { id: "wallaby", name: "Wallaby®", hex: "#7e7a6e", group: "earth" },
  { id: "jasper", name: "Jasper®", hex: "#685e4f", group: "earth" },
  { id: "bushland", name: "Bushland®", hex: "#7a7361", group: "earth" },
  { id: "pale-eucalypt", name: "Pale Eucalypt®", hex: "#7d8871", group: "earth" },
  { id: "cottage-green", name: "Cottage Green®", hex: "#2c4031", group: "dark" },
  { id: "manor-red", name: "Manor Red®", hex: "#6b2f2c", group: "dark" },
  { id: "headland", name: "Headland®", hex: "#6b6452", group: "earth" },
  { id: "terrain", name: "Terrain®", hex: "#6f5a4a", group: "earth" },
  { id: "deep-ocean", name: "Deep Ocean®", hex: "#2f4858", group: "dark" },
  { id: "woodland-grey", name: "Woodland Grey®", hex: "#4a4c4a", group: "dark" },
  { id: "ironstone", name: "Ironstone®", hex: "#3e4347", group: "dark" },
  { id: "basalt", name: "Basalt®", hex: "#52575a", group: "dark" },
  { id: "monument", name: "Monument®", hex: "#3a3a3c", group: "dark" },
  { id: "night-sky", name: "Night Sky®", hex: "#1d1f22", group: "dark" },
];

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}
