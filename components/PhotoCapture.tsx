"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, ImagePlus, RefreshCw } from "lucide-react";

interface PhotoCaptureProps {
  initialPhotoBase64?: string | null;
  onConfirm: (photoBase64: string) => void;
}

export default function PhotoCapture({
  initialPhotoBase64 = null,
  onConfirm,
}: PhotoCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [previewBase64, setPreviewBase64] = useState<string | null>(
    initialPhotoBase64
  );
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setCameraError(
        "Caméra directe non disponible sur cet appareil. Utilisez le bouton ci-dessous pour prendre ou choisir une photo."
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
        audio: false,
      });

      streamRef.current = stream;
      setCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch {
      setCameraError(
        "Accès caméra refusé ou indisponible. Vous pouvez capturer une photo via le sélecteur ci-dessous."
      );
    }
  }, []);

  useEffect(() => {
    if (!previewBase64) {
      startCamera();
    }
    return () => {
      stopStream();
    };
  }, [previewBase64, startCamera, stopStream]);

  const handleCaptureFrame = () => {
    const video = videoRef.current;
    if (!video) return;

    const width = video.videoWidth || 800;
    const height = video.videoHeight || 600;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    stopStream();
    setPreviewBase64(dataUrl);
  };

  const handleFileFallback = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1200;
        let w = img.width || 800;
        let h = img.height || 600;
        if (w > maxDim || h > maxDim) {
          const ratio = Math.min(maxDim / w, maxDim / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          const jpegBase64 = canvas.toDataURL("image/jpeg", 0.85);
          stopStream();
          setPreviewBase64(jpegBase64);
        }
      };
      if (typeof reader.result === "string") {
        img.src = reader.result;
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRetake = () => {
    setPreviewBase64(null);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-slate-50">
          Étape 1/3 — Photo du colis remis
        </h2>
        <p className="text-sm text-slate-400">
          Prenez une photo nette du colis au moment de la remise au client.
        </p>
      </div>

      {!previewBase64 ? (
        <div className="space-y-4">
          <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="h-full w-full object-cover"
            />

            {cameraError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-900/95 p-6 text-center">
                <Camera className="h-12 w-12 text-primary" />
                <p className="text-sm text-slate-300">{cameraError}</p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-14 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-base font-semibold text-white"
                >
                  <ImagePlus className="h-5 w-5" />
                  <span>Prendre / Choisir une photo</span>
                </button>
              </div>
            )}

            {/* Bouton rond de capture en bas de l'aperçu vidéo */}
            {cameraActive && (
              <div className="absolute bottom-6 left-0 right-0 flex flex-col items-center gap-2">
                <button
                  type="button"
                  aria-label="Capturer la photo"
                  onClick={handleCaptureFrame}
                  className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-primary text-white shadow-xl transition active:scale-90"
                >
                  <Camera className="h-8 w-8" />
                </button>
                <span className="rounded-full bg-slate-950/80 px-3 py-1 text-xs font-semibold text-slate-200">
                  Appuyez pour capturer
                </span>
              </div>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileFallback}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-semibold text-slate-300 transition active:scale-[0.98]"
          >
            <ImagePlus className="h-4 w-4 text-primary" />
            <span>Ou importer depuis l&apos;appareil</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl border border-primary/40 bg-slate-900">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewBase64}
              alt="Aperçu de la photo du colis"
              className="h-full w-full object-cover"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleRetake}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 text-base font-semibold text-slate-200 transition active:scale-[0.98]"
            >
              <RefreshCw className="h-5 w-5" />
              <span>Reprendre</span>
            </button>

            <button
              type="button"
              onClick={() => onConfirm(previewBase64)}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-semibold text-white shadow-lg shadow-primary/25 transition active:scale-[0.98]"
            >
              <Check className="h-5 w-5" />
              <span>Utiliser</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

