import React, { useRef, useState } from 'react';
import { Camera, Download, Film, Upload, Video, X } from 'lucide-react';
import { useLunar } from '../context/LunarContext.tsx';

export const VideoAnimatorModal: React.FC = () => {
  const { videoModalOpen, setVideoModalOpen, capturedSnapshot, setCapturedSnapshot } = useLunar();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoMime, setPhotoMime] = useState<string>('image/png');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [duration, setDuration] = useState<'5s' | '8s' | '10s'>('5s');
  const [prompt, setPrompt] = useState<string>(
    'Smooth aerospace orbital reconnaissance flyover with realistic low-angle lunar sunlight and moving surface shadows.'
  );
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [recordingWebgl, setRecordingWebgl] = useState(false);

  if (!videoModalOpen) return null;

  const activePhoto = photoDataUrl || capturedSnapshot;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoMime(file.type || 'image/png');
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPhotoDataUrl(reader.result);
        setCapturedSnapshot(null);
        setErrorMsg(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const captureActiveCanvas = () => {
    const canvases = Array.from(document.querySelectorAll('canvas'));
    const target =
      canvases.find((c) => c.width >= 300 && c.height >= 200) || canvases[0];
    if (!target) {
      setErrorMsg('No active 3D or DEM canvas found on the current screen.');
      return;
    }
    try {
      const url = target.toDataURL('image/png');
      setPhotoDataUrl(url);
      setPhotoMime('image/png');
      setErrorMsg(null);
    } catch {
      setErrorMsg('Unable to snapshot canvas pixels.');
    }
  };

  const handleGenerateAiVideo = async () => {
    if (!activePhoto) {
      setErrorMsg('Upload a photo or capture a 3D frame first.');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/ai/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: activePhoto,
          mimeType: photoMime,
          prompt,
          aspectRatio,
          duration,
        }),
      });
      const data = (await res.json()) as {
        videoBase64?: string;
        mimeType?: string;
        error?: string;
      };
      if (!res.ok || !data.videoBase64) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const byteChars = atob(data.videoBase64);
      const bytes = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        bytes[i] = byteChars.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: data.mimeType || 'video/mp4' });
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      setVideoUrl(URL.createObjectURL(blob));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Video generation failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleRecordLiveCanvas = () => {
    const canvases = Array.from(document.querySelectorAll('canvas'));
    const src = canvases.find((c) => c.width >= 300 && c.height >= 200) || canvases[0];
    if (!src || typeof src.captureStream !== 'function' || typeof MediaRecorder === 'undefined') {
      setErrorMsg('Live canvas video capture requires an active 3D viewport and browser MediaRecorder support.');
      return;
    }
    setErrorMsg(null);
    setRecordingWebgl(true);

    // Offscreen compositor canvas respecting 16:9 or 9:16 aspect ratio
    const comp = document.createElement('canvas');
    comp.width = aspectRatio === '16:9' ? 1280 : 720;
    comp.height = aspectRatio === '16:9' ? 720 : 1280;
    const ctx = comp.getContext('2d');

    const stream = comp.captureStream(30);
    const recorder = new MediaRecorder(stream, {
      mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm',
    });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) chunks.push(ev.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      setVideoUrl(URL.createObjectURL(blob));
      setRecordingWebgl(false);
    };

    recorder.start();
    const startMs = performance.now();
    const drawLoop = () => {
      if (!ctx) return;
      ctx.fillStyle = '#04070e';
      ctx.fillRect(0, 0, comp.width, comp.height);
      const scale = Math.max(comp.width / Math.max(1, src.width), comp.height / Math.max(1, src.height));
      const dw = src.width * scale;
      const dh = src.height * scale;
      ctx.drawImage(src, (comp.width - dw) / 2, (comp.height - dh) / 2, dw, dh);
      if (performance.now() - startMs < 4000) {
        requestAnimationFrame(drawLoop);
      } else {
        recorder.stop();
      }
    };
    drawLoop();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-[#0B1120] border border-slate-700 rounded-md shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Film className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-slate-100">
              Mission Photo-to-Video Studio (Gemini Omni 1.2 Flash &amp; 3D Capture)
            </h3>
          </div>
          <button
            onClick={() => setVideoModalOpen(false)}
            className="p-1 text-slate-400 hover:text-white rounded"
            aria-label="Close Video Studio"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Input Photo / Snapshot */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-200">1. Source Photo / Frame</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded flex items-center gap-1"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Upload Photo
                  </button>
                  <button
                    onClick={captureActiveCanvas}
                    className="px-2.5 py-1 bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-700/60 text-cyan-300 rounded flex items-center gap-1"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    Snapshot 3D View
                  </button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              <div className="aspect-video bg-[#060911] border border-slate-800 rounded overflow-hidden flex items-center justify-center">
                {activePhoto ? (
                  <img
                    src={activePhoto}
                    alt="Uploaded mission input"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="text-center text-slate-500 px-4">
                    Upload a lunar/launch photo or click Snapshot 3D View to capture the active canvas.
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-slate-400 mb-1">Aspect Ratio</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['16:9', '9:16'] as const).map((ratio) => (
                      <button
                        key={ratio}
                        onClick={() => setAspectRatio(ratio)}
                        className={`py-1.5 rounded font-mono border ${
                          aspectRatio === ratio
                            ? 'bg-cyan-600/20 border-cyan-500 text-cyan-200 font-semibold'
                            : 'bg-[#060911] border-slate-700 text-slate-300'
                        }`}
                      >
                        {ratio === '16:9' ? '16:9 Landscape' : '9:16 Portrait'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400 mb-1">Clip Duration</div>
                  <div className="grid grid-cols-3 gap-1">
                    {(['5s', '8s', '10s'] as const).map((d) => (
                      <button
                        key={d}
                        onClick={() => setDuration(d)}
                        className={`py-1.5 rounded font-mono border ${
                          duration === d
                            ? 'bg-cyan-600/20 border-cyan-500 text-cyan-200 font-semibold'
                            : 'bg-[#060911] border-slate-700 text-slate-300'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <label className="block space-y-1">
                <span className="text-slate-400">Animation / Camera Motion Prompt</span>
                <textarea
                  rows={3}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="w-full bg-[#060911] border border-slate-700 rounded p-2 text-xs text-slate-100"
                />
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleGenerateAiVideo}
                  disabled={loading || !activePhoto}
                  className="flex-1 py-2 px-3 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-slate-950 font-semibold rounded flex items-center justify-center gap-1.5"
                >
                  <Video className="w-3.5 h-3.5" />
                  {loading ? 'Generating AI Video (Omni Flash)...' : 'Animate Photo with Gemini'}
                </button>
                <button
                  onClick={handleRecordLiveCanvas}
                  disabled={recordingWebgl}
                  className="py-2 px-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 rounded flex items-center gap-1.5"
                >
                  <Film className="w-3.5 h-3.5 text-amber-400" />
                  {recordingWebgl ? 'Recording 4s...' : 'Record 3D Canvas (4s)'}
                </button>
              </div>
            </div>

            {/* Output Video Player */}
            <div className="space-y-2.5 flex flex-col">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-200">2. Generated Video Output</span>
                {videoUrl && (
                  <a
                    href={videoUrl}
                    download={`arc-luna-animation-${aspectRatio.replace(':', 'x')}.mp4`}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download
                  </a>
                )}
              </div>

              <div
                className={`bg-[#060911] border border-slate-800 rounded overflow-hidden flex items-center justify-center flex-1 min-h-[240px] ${
                  aspectRatio === '9:16' ? 'max-w-[260px] mx-auto w-full aspect-[9/16]' : 'aspect-video w-full'
                }`}
              >
                {videoUrl ? (
                  <video src={videoUrl} controls autoPlay loop className="w-full h-full object-contain" />
                ) : (
                  <div className="text-center text-slate-500 px-4">
                    {loading
                      ? 'Rendering animated sequence via gemini-omni-1.2-flash Interactions API...'
                      : 'Generated video preview will appear here.'}
                  </div>
                )}
              </div>

              {errorMsg && (
                <div className="p-2.5 bg-amber-950/30 border border-amber-800/60 rounded text-amber-200 leading-relaxed">
                  {errorMsg}
                </div>
              )}

              <div className="text-[11px] text-slate-400 bg-[#060911] border border-slate-800 rounded p-2.5">
                AI Photo-to-Video uses <span className="font-mono text-slate-200">gemini-omni-1.2-flash</span> via server-side Interactions API (requires a paid GEMINI_API_KEY). Alternatively, <span className="text-amber-300">Record 3D Canvas</span> captures live Three.js visualizations directly to WebM video.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
