// Client-side helpers for punch verification photos, shared by the standalone
// clock page and the in-job "My shift" card.

// Downscale + re-encode an image in the browser before upload. Phone camera
// photos are often several MB / many megapixels, which can exceed the upload
// body limit; a ~1600px JPEG is plenty for a verification photo and uploads
// reliably. Falls back to the original file if anything goes wrong.
export async function compressImage(file: File, maxDim = 1600, quality = 0.8): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const dataUrl: string = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    const img: HTMLImageElement = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = dataUrl;
    });
    let { width, height } = img;
    if (Math.max(width, height) > maxDim) {
      const scale = maxDim / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, width, height);
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export async function uploadPunchPhoto(file: File, jobId: string): Promise<string> {
  const compressed = await compressImage(file);
  const fd = new FormData();
  fd.append("file", compressed);
  fd.append("prefix", `punch-photos/${jobId}`);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  // The endpoint may return an HTML error page (e.g. a request-too-large proxy
  // error) rather than JSON — parse defensively so we surface a clear message.
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* non-JSON response */ }
  if (!res.ok || !json?.url) {
    throw new Error(json?.error || `Photo upload failed (${res.status}). Please try again.`);
  }
  return json.url as string;
}
