"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

type Props = {
  lat: number;
  lng: number;
};

export function AerialMap({ lat, lng }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled || !containerRef.current) return;

      try {
        mapRef.current = new maplibregl.Map({
          container: containerRef.current,
          style: {
            version: 8,
            sources: {
              nearmap: {
                type: "raster",
                tiles: [
                  `${window.location.origin}/api/nearmap/{z}/{x}/{y}`,
                ],
                tileSize: 256,
                attribution: "© Nearmap",
                minzoom: 17,
                maxzoom: 22,
              },
            },
            layers: [
              {
                id: "nearmap",
                type: "raster",
                source: "nearmap",
              },
            ],
          },
          center: [lng, lat],
          zoom: 20,
          minZoom: 17,
          maxZoom: 22,
          attributionControl: { compact: true },
        });

        mapRef.current.on("error", (e) => {
          const status = (e.error as { status?: number } | undefined)?.status;
          if (status === 401 || status === 403) {
            setError("Nearmap key is missing or unauthorised.");
          }
        });

        mapRef.current.addControl(
          new maplibregl.NavigationControl({ showCompass: false }),
          "top-right"
        );

        new maplibregl.Marker({ color: "#0ea5e9" })
          .setLngLat([lng, lat])
          .addTo(mapRef.current);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load map");
      }
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [lat, lng]);

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="aspect-[4/3] w-full sm:aspect-[16/10]"
        aria-label="Aerial view of your home"
      />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface/95 p-6 text-center">
          <div className="max-w-sm">
            <div className="text-sm font-semibold text-foreground">
              Couldn&apos;t load aerial imagery
            </div>
            <div className="mt-1 text-xs text-muted">{error}</div>
          </div>
        </div>
      )}
    </div>
  );
}
