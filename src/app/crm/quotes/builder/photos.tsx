"use client";

import { useRef, useState } from "react";

import { Icon } from "@/components/crm/icon";
import { useToast } from "@/components/crm/toast";
import { Checkbox } from "@/components/crm/ui";
import { deletePhoto, updatePhotoCaption, uploadPhoto } from "../actions";
import type { PhotoView } from "../helpers";

/**
 * Site photos from the visit.
 *
 * Resized in the browser before they leave it. A modern phone camera produces
 * 4–8MB per shot; a dozen of those is a slow upload over a suburban 4G signal
 * and a PDF nobody can email. 1600px on the long edge is more than an A4 print
 * can resolve, so nothing visible is lost.
 */
const MAX_EDGE_PX = 1600;
const JPEG_QUALITY = 0.8;

async function shrink(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));

  const context = canvas.getContext("2d");
  if (!context) return file;
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) return file;

  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
}

export function PhotosSection({
  quoteId,
  photos,
  onPhotosChange,
  include,
  onToggleInclude,
  ensureSaved,
}: {
  quoteId: string | null;
  photos: PhotoView[];
  onPhotosChange: (next: PhotoView[]) => void;
  include: boolean;
  onToggleInclude: (on: boolean) => void;
  /** Photos attach to a row, so a brand-new quote is saved first. */
  ensureSaved: () => Promise<string | null>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const toast = useToast();

  const addFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;

    setUploading(true);
    try {
      const id = quoteId ?? (await ensureSaved());
      if (!id) {
        toast("Choose a client first — photos attach to the quote.", "warning");
        return;
      }

      const added: PhotoView[] = [];
      for (const file of Array.from(list)) {
        try {
          const resized = await shrink(file);
          const form = new FormData();
          form.append("file", resized);

          const result = await uploadPhoto(id, form);
          if (!result.ok) {
            toast(result.error, "warning");
            continue;
          }
          added.push(result.photo);
        } catch (error) {
          // A format the browser cannot decode — a HEIC that Safari did not
          // convert, or a corrupt file. One bad photo must not abandon the rest
          // of the batch halfway through an upload on a site visit.
          console.error("photo upload failed", error);
          toast(`Couldn't read ${file.name} — try a JPEG or PNG.`, "warning");
        }
      }

      if (added.length > 0) onPhotosChange([...photos, ...added]);
    } finally {
      setUploading(false);
    }
  };

  const remove = async (photo: PhotoView) => {
    if (!quoteId) return;
    onPhotosChange(photos.filter((p) => p.id !== photo.id));
    const result = await deletePhoto(quoteId, photo.id);
    if (!result.ok) toast(result.error, "warning");
  };

  const setCaption = (photoId: string, caption: string) =>
    onPhotosChange(photos.map((p) => (p.id === photoId ? { ...p, caption } : p)));

  const commitCaption = async (photo: PhotoView) => {
    if (!quoteId) return;
    const result = await updatePhotoCaption(quoteId, photo.id, photo.caption ?? "");
    if (!result.ok) toast(result.error, "warning");
  };

  return (
    <div>
      <div className="photo-grid">
        {photos.map((photo) => (
          <div className="photo-cell" key={photo.id}>
            <div
              className="photo-tile"
              style={
                photo.url
                  ? {
                      backgroundImage: `url(${photo.url})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }
                  : { background: "var(--surface-3)" }
              }
            >
              {!photo.url && <Icon name="image" size={20} color="var(--muted-foreground)" />}
              <button
                type="button"
                className="photo-tile__del"
                title="Remove photo"
                aria-label="Remove photo"
                onClick={() => void remove(photo)}
              >
                <Icon name="x" size={12} />
              </button>
            </div>
            {include && (
              <input
                className="photo-cap"
                placeholder="Caption on PDF…"
                value={photo.caption ?? ""}
                onChange={(e) => setCaption(photo.id, e.target.value)}
                onBlur={() => void commitCaption(photo)}
                aria-label="Photo caption"
              />
            )}
          </div>
        ))}

        <button
          type="button"
          className="photo-add"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          <Icon name={uploading ? "loader-2" : "camera"} size={18} className={uploading ? "spin-ic" : ""} />
          <span>{uploading ? "Uploading…" : "Add photo"}</span>
        </button>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <Checkbox on={include} onChange={onToggleInclude}>
          Include site photos on the PDF
        </Checkbox>
      </div>
    </div>
  );
}
