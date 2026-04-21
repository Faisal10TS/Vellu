// Lazy-loaded QR code generator. Uses `qrcode` to render both a canvas
// (for in-page preview + PNG download) and an SVG string (for vector-quality
// print).
//
// Loaded on demand from OwnerApp so the ~15KB library doesn't weigh down
// the initial owner-dashboard bundle.

import QRCode from "qrcode";

const DEFAULT_OPTS = {
  errorCorrectionLevel: "Q",   // up to 25% recovery — survives a logo overlay or scuffed print
  margin: 2,                    // quiet zone in modules (not pixels)
  color: {
    dark: "#0d0b0a",            // Vellu near-black
    light: "#ffffff",           // white background for reliable contrast
  },
};

// Render to canvas element (for live preview). Returns a data URL.
export async function renderQrDataUrl(url, size = 512) {
  return QRCode.toDataURL(url, { ...DEFAULT_OPTS, width: size });
}

// Render to SVG string (for vector export). Print shops prefer SVG so the
// QR stays sharp at any scale.
export async function renderQrSvg(url) {
  return QRCode.toString(url, { ...DEFAULT_OPTS, type: "svg" });
}

// Convenience: download a file using a Blob + anchor click. Same pattern
// as the CSV/PDF exporters.
export function triggerDownload(filename, data, mimeType) {
  const blob = typeof data === "string"
    ? new Blob([data], { type: mimeType })
    : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Convert a data URL ("data:image/png;base64,...") to a Blob for download.
export function dataUrlToBlob(dataUrl) {
  const [meta, b64] = dataUrl.split(",");
  const mime = meta.match(/data:([^;]+)/)?.[1] || "application/octet-stream";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
