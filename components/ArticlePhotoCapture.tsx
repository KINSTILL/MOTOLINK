"use client";

import { useState } from "react";
import { Loader2, Plus, X } from "lucide-react";

interface ArticlePhotoCaptureProps {
  photos: string[];
  onChange: (urls: string[]) => void;
  onBlur?: () => void;
}

/**
 * Compresse une image côté client en WebP (max 1 Mo, redimensionnement max 1280px)
 */
async function compressImageToWebP(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const MAX_DIM = 1280;
      let width = img.width;
      let height = img.height;

      if (width > MAX_DIM || height > MAX_DIM) {
        if (width > height) {
          height = Math.round((height * MAX_DIM) / width);
          width = MAX_DIM;
        } else {
          width = Math.round((width * MAX_DIM) / height);
          height = MAX_DIM;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        reject(new Error("Impossible d'initialiser le canvas de compression"));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      const tryCompress = (quality: number) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Échec de la compression WebP"));
              return;
            }
            if (blob.size > 1024 * 1024 && quality > 0.3) {
              tryCompress(quality - 0.15);
            } else {
              resolve(blob);
            }
          },
          "image/webp",
          quality
        );
      };

      tryCompress(0.82);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Fichier image invalide"));
    };

    img.src = objectUrl;
  });
}

export default function ArticlePhotoCapture({
  photos,
  onChange,
  onBlur,
}: ArticlePhotoCaptureProps) {
  const [uploadingSlot, setUploadingSlot] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSelectFile = async (
    slotIndex: number,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingSlot(slotIndex);
    setError(null);

    try {
      const compressedBlob = await compressImageToWebP(file);
      const webpFile = new File([compressedBlob], `article-${slotIndex + 1}.webp`, {
        type: "image/webp",
      });

      const formData = new FormData();
      formData.append("file", webpFile);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erreur lors du téléversement.");
        setUploadingSlot(null);
        return;
      }

      const nextPhotos = [...photos];
      if (slotIndex < nextPhotos.length) {
        nextPhotos[slotIndex] = data.url;
      } else {
        nextPhotos.push(data.url);
      }
      onChange(nextPhotos.slice(0, 2));
      onBlur?.();
    } catch {
      setError("Impossible de compresser ou téléverser cette photo.");
    } finally {
      setUploadingSlot(null);
      e.target.value = "";
    }
  };

  const handleRemove = (slotIndex: number) => {
    const nextPhotos = photos.filter((_, idx) => idx !== slotIndex);
    onChange(nextPhotos);
    onBlur?.();
  };

  return (
    <div className="space-y-2">
      {/* 2 emplacements côte à côte, grille 2 colonnes ratio 1:1 */}
      <div className="grid grid-cols-2 gap-3">
        {[0, 1].map((slotIdx) => {
          const photoUrl = photos[slotIdx];
          const isUploading = uploadingSlot === slotIdx;

          if (photoUrl) {
            return (
              <div
                key={slotIdx}
                className="relative aspect-square w-full overflow-hidden rounded-xl border border-slate-700 bg-slate-900"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoUrl}
                  alt={`Photo article ${slotIdx + 1}`}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => handleRemove(slotIdx)}
                  aria-label={`Supprimer la photo ${slotIdx + 1}`}
                  className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-slate-950/85 text-white shadow-md transition active:scale-95"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          }

          return (
            <label
              key={slotIdx}
              className="flex aspect-square min-h-24 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-700 bg-slate-900 p-3 text-center text-slate-400 transition hover:border-primary/60 hover:text-slate-200 active:scale-[0.98]"
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-7 w-7 animate-spin text-primary" />
                  <span className="text-xs font-medium text-slate-300">
                    Compression WebP...
                  </span>
                </>
              ) : (
                <>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-primary">
                    <Plus className="h-6 w-6" />
                  </div>
                  <span className="text-sm font-semibold text-slate-200">
                    Ajouter une photo
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {slotIdx === 0 ? "Photo 1 (obligatoire)" : "Photo 2 (optionnelle)"}
                  </span>
                </>
              )}

              <input
                type="file"
                accept="image/*"
                capture="environment"
                disabled={isUploading}
                onChange={(e) => handleSelectFile(slotIdx, e)}
                className="hidden"
              />
            </label>
          );
        })}
      </div>

      {error && (
        <p className="text-sm font-medium text-danger">{error}</p>
      )}
    </div>
  );
}

