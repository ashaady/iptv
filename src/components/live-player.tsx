"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import {
  AlertCircle,
  ExternalLink,
  History,
  Loader2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
} from "lucide-react";
import type mpegts from "mpegts.js";
import { useCallback, useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    desktopApi?: {
      isDesktop: boolean;
      openInVlc: (streamUrl: string, title: string) => Promise<{ success: boolean; error?: string }>;
      toggleFullScreen: () => Promise<boolean>;
      minimize: () => Promise<void>;
      maximize: () => Promise<void>;
      close: () => Promise<void>;
      setKeepAwake: (enable: boolean) => Promise<boolean>;
    };
  }
}

interface LivePlayerProps {
  url: string;
  channelName: string;
  streamId: string | number;
  isTimeshift?: boolean;
  timeshiftLabel?: string;
  onExitTimeshift?: () => void;
  onOpenTimeshiftMenu?: () => void;
  hasTimeshiftArchive?: boolean;
  onPlaybackSuccess?: () => void;
  onPlaybackError?: () => void;
}

function formatDelay(delay: number): string {
  if (delay <= 4) return "DIRECT";
  const s = Math.round(delay);
  const m = Math.floor(s / 60);
  const remS = s % 60;
  return `-${m > 0 ? `${m}m ` : ""}${remS < 10 && m > 0 ? "0" : ""}${remS}s`;
}

function formatDuration(sec: number): string {
  if (isNaN(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function LivePlayer({
  url,
  channelName,
  streamId,
  isTimeshift = false,
  timeshiftLabel,
  onExitTimeshift,
  onOpenTimeshiftMenu,
  hasTimeshiftArchive = true,
  onPlaybackSuccess,
  onPlaybackError,
}: LivePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<mpegts.Player | null>(null);
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recoveryAttemptsRef = useRef(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [bufferStart, setBufferStart] = useState(0);
  const [bufferEnd, setBufferEnd] = useState(0);
  const [delaySeconds, setDelaySeconds] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [isDesktop, setIsDesktop] = useState(false);
  const [useTranscode, setUseTranscode] = useState(false);

  useEffect(() => {
    setUseTranscode(false);
  }, [streamId]);

  useEffect(() => {
    setIsDesktop(Boolean(typeof window !== "undefined" && window.desktopApi?.isDesktop));
  }, []);

  const handleOpenInVlc = useCallback(async () => {
    if (window.desktopApi) {
      await window.desktopApi.openInVlc(url, channelName);
    }
  }, [url, channelName]);

  const handleRetry = useCallback(() => {
    setError(null);
    setLoading(true);
    setRetryCount((prev) => prev + 1);
  }, []);

  const toggleMute = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
    }
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, []);

  const updatePlaybackState = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const cur = v.currentTime;
    setCurrentTime(cur);
    setIsPlaying(!v.paused);

    if (v.buffered && v.buffered.length > 0) {
      const bStart = v.buffered.start(0);
      const bEnd = v.buffered.end(v.buffered.length - 1);
      setBufferStart(bStart);
      setBufferEnd(bEnd);
      const delay = Math.max(0, bEnd - cur);
      setDelaySeconds(delay);
    }
  }, []);

  const handleRewind = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    const bStart = video.buffered && video.buffered.length > 0 ? video.buffered.start(0) : 0;
    video.currentTime = Math.max(bStart, video.currentTime - seconds);
    updatePlaybackState();
  }, [updatePlaybackState]);

  const handleForward = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    const bEnd = video.buffered && video.buffered.length > 0 ? video.buffered.end(video.buffered.length - 1) : video.currentTime;
    video.currentTime = Math.min(bEnd, video.currentTime + seconds);
    updatePlaybackState();
  }, [updatePlaybackState]);

  const handleReturnToLive = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.buffered && video.buffered.length > 0) {
      const bEnd = video.buffered.end(video.buffered.length - 1);
      video.currentTime = Math.max(0, bEnd - 1.5);
    }
    if (video.paused) {
      video.play().catch(() => {});
    }
    updatePlaybackState();
  }, [updatePlaybackState]);

  const handleScrubberClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

    if (video.buffered && video.buffered.length > 0) {
      const bStart = video.buffered.start(0);
      const bEnd = video.buffered.end(video.buffered.length - 1);
      const target = bStart + clickRatio * (bEnd - bStart);
      video.currentTime = target;
      updatePlaybackState();
    }
  }, [updatePlaybackState]);

  const handleToggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  }, []);

  const handleMouseMove = useCallback(() => {
    setShowControls(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setShowControls(false);
      }
    }, 4000);
  }, []);

  // Clavier pour raccourcis média (Espace: Pause, Flèches: Recul/Avance, M: Mute, F: Fullscreen)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;

      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        handleRewind(15);
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        handleForward(15);
      } else if (e.code === "KeyM") {
        toggleMute();
      } else if (e.code === "KeyF") {
        handleToggleFullscreen();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlay, handleRewind, handleForward, toggleMute, handleToggleFullscreen]);

  // Initialisation et gestion du lecteur mpegts
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) return;

    setError(null);
    setLoading(true);

    let isCancelled = false;
    let player: mpegts.Player | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let stallTimer: ReturnType<typeof setInterval> | null = null;
    let lastPlaybackTime = video.currentTime;
    let lastProgressAt = Date.now();

    const scheduleRecovery = (reason: string) => {
      if (isCancelled || reconnectTimer) return;

      const attempt = recoveryAttemptsRef.current + 1;
      recoveryAttemptsRef.current = attempt;
      const delay = Math.min(1000 * 2 ** Math.min(attempt - 1, 3), 8000);
      console.warn(`[LivePlayer] ${reason}. Reconnexion dans ${delay} ms (tentative ${attempt}).`);
      setLoading(true);
      reconnectTimer = setTimeout(() => {
        if (!isCancelled) setRetryCount((value) => value + 1);
      }, delay);
    };

    const activeStreamUrl = useTranscode
      ? (url.includes("?") ? `${url}&transcode=true` : `${url}?transcode=true`)
      : url;

    async function getMpegtsModule() {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const mod = await import("mpegts.js");
          return mod?.default || (mod as unknown as typeof import("mpegts.js")["default"]);
        } catch (e) {
          console.warn(`[LivePlayer] Tentative ${attempt}/3 chargement mpegts.js:`, e);
          if (attempt < 3 && !isCancelled) {
            await new Promise((r) => setTimeout(r, 300 * attempt));
          }
        }
      }
      return null;
    }

    async function init() {
      if (!video) return;

      try {
        const mpegtsModule = await getMpegtsModule();
        if (isCancelled) return;

        if (!mpegtsModule) {
          console.warn("[LivePlayer] mpegts.js non disponible, bascule directe HTML5 video");
          video.src = activeStreamUrl;
          video.play().catch(() => {});
          return;
        }

        const features = mpegtsModule.getFeatureList();
        const canPlayMse = features && features.mseLivePlayback && mpegtsModule.isSupported();

        if (canPlayMse) {
          player = mpegtsModule.createPlayer(
            {
              type: "mse",
              isLive: !isTimeshift,
              url: activeStreamUrl,
              cors: true,
            },
            {
              enableWorker: true,
              lazyLoad: false,
              // Ne jamais déplacer automatiquement la tête de lecture :
              // l'utilisateur revient au direct avec le bouton dédié.
              liveBufferLatencyChasing: false,
              liveBufferLatencyChasingOnPaused: false,
              liveBufferLatencyMaxLatency: 8,
              liveBufferLatencyMinRemain: 2,
              enableStashBuffer: true,
              stashInitialSize: 1024 * 1024,
              autoCleanupSourceBuffer: true,
              // Conserve environ une minute en arrière pour le contrôle du direct.
              autoCleanupMaxBackwardDuration: 60,
              autoCleanupMinBackwardDuration: 45,
            }
          );

          playerRef.current = player;
          player.attachMediaElement(video);
          player.load();

          try {
            const playPromise = video.play();
            if (playPromise && typeof playPromise.catch === "function") {
              playPromise.catch(() => {
                if (isCancelled) return;
                try {
                  video.muted = true;
                  setIsMuted(true);
                  video.play().catch(() => {});
                } catch {
                  // ignore
                }
              });
            }
          } catch {
            // ignore
          }

          player.on(mpegtsModule.Events.ERROR, (errorType: string, errorDetail: string) => {
            console.error("Erreur flux live mpegts:", errorType, errorDetail);
            if (isCancelled) return;
            if (errorType === mpegtsModule.ErrorTypes.NETWORK_ERROR) {
              scheduleRecovery("Le serveur IPTV a interrompu le flux");
              return;
            } else {
              // Si le codec audio/vidéo n'est pas supporté en natif (ex: EAC-3/AC-3), tenter automatiquement la conversion AAC via FFmpeg
              if (!useTranscode) {
                console.log("[LivePlayer] Codec MSE non supporté. Bascule automatique sur flux transcodé AAC...");
                setUseTranscode(true);
                return;
              }
              setError("Format vidéo/audio non décodable par le lecteur interne. Cliquez sur « Lire dans VLC » ci-dessous.");
            }
            setLoading(false);
          });

          player.on(mpegtsModule.Events.MEDIA_INFO, () => {
            setLoading(false);
          });
        } else {
          video.src = activeStreamUrl;
          video.play().catch(() => {
            video.muted = true;
            setIsMuted(true);
            video.play().catch(() => {});
          });
        }
      } catch (err) {
        console.error("Erreur chargement mpegts:", err);
        if (video) {
          video.src = activeStreamUrl;
          video.play().catch(() => {});
        }
      }
    }

    init();

    const onPlaying = () => {
      setLoading(false);
      setIsPlaying(true);
      recoveryAttemptsRef.current = 0;
      lastPlaybackTime = video.currentTime;
      lastProgressAt = Date.now();
      window.desktopApi?.setKeepAwake(true);
      onPlaybackSuccess?.();
    };
    const onWaiting = () => {
      setLoading(true);
      lastProgressAt = Date.now();
    };
    const onCanPlay = () => setLoading(false);
    const onPause = () => {
      setIsPlaying(false);
      window.desktopApi?.setKeepAwake(false);
    };
    const onTimeUpdate = () => {
      if (video.currentTime > lastPlaybackTime + 0.05) {
        lastPlaybackTime = video.currentTime;
        lastProgressAt = Date.now();
      }
      updatePlaybackState();
    };
    const onProgress = () => {
      lastProgressAt = Date.now();
      updatePlaybackState();
    };
    const onVideoError = () => {
      if (isCancelled) return;
      const mediaErr = video.error;
      console.warn("[LivePlayer] Erreur élément vidéo HTML5:", mediaErr);
      if (mediaErr) {
        if (!useTranscode) {
          console.log("[LivePlayer] Erreur HTML5, bascule sur transcodage AAC...");
          setUseTranscode(true);
          return;
        }
        onPlaybackError?.();
        if (mediaErr.code === 3 || mediaErr.code === 4) {
          setError("Format vidéo/audio non décodable par le lecteur interne. Cliquez sur « Lire dans VLC » ci-dessous.");
        } else if (mediaErr.code === 2) {
          setError("Erreur réseau lors de la réception du flux vidéo.");
        }
      }
      setLoading(false);
    };

    // Certains serveurs gardent la socket ouverte après une coupure sans produire
    // d'erreur réseau. Le watchdog relance alors le même flux automatiquement.
    stallTimer = setInterval(() => {
      if (isCancelled || video.paused || video.ended || video.readyState === 0) return;
      if (Date.now() - lastProgressAt > 10_000) {
        scheduleRecovery("Lecture bloquée depuis 10 secondes");
      }
    }, 2_000);

    video.addEventListener("playing", onPlaying);
    video.addEventListener("pause", onPause);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("progress", onProgress);
    video.addEventListener("error", onVideoError);

    return () => {
      isCancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (stallTimer) clearInterval(stallTimer);
      window.desktopApi?.setKeepAwake(false);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("progress", onProgress);
      video.removeEventListener("error", onVideoError);

      if (player) {
        try {
          player.pause();
          player.unload();
          player.detachMediaElement();
          player.destroy();
        } catch (e) {
          console.error("Erreur destruction player:", e);
        }
        playerRef.current = null;
      }

      try {
        video.pause();
        video.removeAttribute("src");
        video.load();
      } catch {}
    };
  }, [url, useTranscode, retryCount, isTimeshift, updatePlaybackState]);

  // Calcul du ratio du scrubber glissant
  const bufferDuration = Math.max(1, bufferEnd - bufferStart);
  const currentBufferProgress = Math.max(0, Math.min(100, ((currentTime - bufferStart) / bufferDuration) * 100));
  const isDelayed = delaySeconds > 4;

  return (
    <div
      ref={containerRef}
      className="live-player-container"
      onMouseMove={handleMouseMove}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        background: "#000",
        overflow: "hidden",
      }}
    >
      <video
        ref={videoRef}
        playsInline
        onClick={togglePlay}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          background: "#000",
          display: "block",
          cursor: "pointer",
        }}
      />

      {/* Loading Overlay */}
      {loading && !error && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            background: "rgba(0, 0, 0, 0.65)",
            backdropFilter: "blur(4px)",
            color: "#fff",
            zIndex: 10,
            pointerEvents: "none",
          }}
        >
          <Loader2 className="spin" size={36} style={{ color: "var(--accent, #d9ff52)" }} />
          <p style={{ fontSize: 14, fontWeight: 500 }}>
            {useTranscode
              ? "Adaptation audio compatible (AAC) en cours..."
              : isTimeshift
              ? "Chargement du Replay..."
              : "Connexion au direct en cours..."}
          </p>
          <small style={{ color: "var(--muted, #9aa2ae)", fontSize: 12 }}>
            {channelName} (#{streamId}) {isTimeshift && timeshiftLabel ? `· ${timeshiftLabel}` : ""}
          </small>
        </div>
      )}

      {/* Error Overlay */}
      {error && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
            background: "rgba(10, 12, 16, 0.92)",
            color: "#fff",
            padding: 24,
            textAlign: "center",
            zIndex: 12,
          }}
        >
          <AlertCircle size={40} style={{ color: "#ff5e50" }} />
          <div>
            <strong style={{ fontSize: 15, display: "block", marginBottom: 4 }}>Flux indisponible</strong>
            <p style={{ color: "var(--muted, #9aa2ae)", fontSize: 13, maxWidth: 380 }}>{error}</p>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap", justifyContent: "center" }}>
            <button onClick={handleRetry} className="button button-primary compact">
              <RefreshCw size={15} /> Réessayer
            </button>
            {isTimeshift && onExitTimeshift && (
              <button onClick={onExitTimeshift} className="button button-ghost compact">
                Retourner au direct
              </button>
            )}
            {isDesktop && (
              <button
                onClick={handleOpenInVlc}
                className="button button-ghost compact"
                style={{ borderColor: "#ff9540", color: "#ff9540" }}
              >
                <ExternalLink size={14} /> Lire dans VLC (Externe)
              </button>
            )}
          </div>
        </div>
      )}

      {/* Top Overlay Badges */}
      <div
        className="nyx-player-topbar"
        style={{
          position: "absolute",
          top: 14,
          left: 14,
          right: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          zIndex: 5,
          pointerEvents: "none",
          transition: "opacity 0.25s",
          opacity: showControls || !isPlaying ? 1 : 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, pointerEvents: "auto" }}>
          <strong className="nyx-player-channel">{channelName}</strong>
          {isTimeshift ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "rgba(217, 255, 82, 0.18)",
                border: "1px solid var(--accent, #d9ff52)",
                borderRadius: 20,
                padding: "4px 12px",
                fontSize: 12,
                fontWeight: 700,
                color: "var(--accent, #d9ff52)",
              }}
            >
              <History size={14} />
              <span>REPLAY SERVEUR {timeshiftLabel ? `(${timeshiftLabel})` : ""}</span>
            </div>
          ) : isDelayed ? (
            <button
              onClick={handleReturnToLive}
              title="Cliquer pour revenir instantanément au direct"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "rgba(255, 149, 0, 0.22)",
                border: "1px solid #ff9500",
                borderRadius: 20,
                padding: "4px 12px",
                fontSize: 12,
                fontWeight: 700,
                color: "#ff9500",
                cursor: "pointer",
                animation: "pulse 2s infinite",
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ff9500" }} />
              <span>DIFFÉRÉ ({formatDelay(delaySeconds)}) · REVENIR AU DIRECT</span>
            </button>
          ) : (
            <div className="live-pill">
              <span /> EN DIRECT
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, pointerEvents: "auto" }}>
          {isTimeshift && onExitTimeshift && (
            <button
              onClick={onExitTimeshift}
              style={{
                background: "rgba(255, 255, 255, 0.12)",
                color: "#fff",
                border: "1px solid rgba(255, 255, 255, 0.3)",
                borderRadius: 20,
                padding: "4px 12px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Quitter Replay
            </button>
          )}

          {isDesktop && (
            <button
              onClick={handleOpenInVlc}
              title="Ouvrir directement ce flux dans VLC"
              style={{
                background: "rgba(255, 120, 20, 0.2)",
                color: "#ff9540",
                border: "1px solid rgba(255, 140, 50, 0.4)",
                borderRadius: 20,
                padding: "4px 12px",
                fontSize: 12,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 5,
                cursor: "pointer",
              }}
            >
              <ExternalLink size={13} />
              <span>VLC</span>
            </button>
          )}
        </div>
      </div>

      {/* Barre de contrôle DVR moderne en bas */}
      <div
        className="nyx-player-controls"
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          background: "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.65) 60%, transparent 100%)",
          padding: "24px 16px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          zIndex: 6,
          transition: "opacity 0.25s, transform 0.25s",
          opacity: showControls || !isPlaying ? 1 : 0,
          transform: showControls || !isPlaying ? "translateY(0)" : "translateY(8px)",
          pointerEvents: showControls || !isPlaying ? "auto" : "none",
        }}
      >
        {/* Scrubber de tampon glissant */}
        <div
          className="nyx-player-scrubber"
          onClick={handleScrubberClick}
          style={{
            position: "relative",
            width: "100%",
            height: 8,
            borderRadius: 4,
            background: "rgba(255, 255, 255, 0.15)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
          }}
          title={`Tampon DVR: ${formatDuration(bufferDuration)} enregistrées`}
        >
          {/* Barre de lecture */}
          <div
            className="nyx-player-progress"
            style={{
              height: "100%",
              width: `${currentBufferProgress}%`,
              background: isDelayed ? "#ff9500" : "var(--accent, #d9ff52)",
              borderRadius: 4,
              transition: "width 0.1s linear",
            }}
          />
          {/* Tête de lecture */}
          <div
            style={{
              position: "absolute",
              left: `calc(${currentBufferProgress}% - 6px)`,
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: "#fff",
              boxShadow: "0 0 8px rgba(0,0,0,0.8)",
            }}
          />
        </div>

        {/* Ligne des boutons d'action */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {/* Côté gauche : Play, Recul -30s, Recul -15s, Avance +15s */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              onClick={togglePlay}
              style={{
                width: 38,
                height: 38,
                borderRadius: "50%",
                background: "rgba(255, 255, 255, 0.12)",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                color: "#fff",
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
              }}
              title={isPlaying ? "Pause (Espace)" : "Lecture (Espace)"}
            >
              {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" style={{ marginLeft: 2 }} />}
            </button>

            {/* Recul 30s */}
            <button
              type="button"
              onClick={() => handleRewind(30)}
              style={{
                background: "rgba(255, 255, 255, 0.08)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                color: "#fff",
                borderRadius: 8,
                padding: "6px 9px",
                fontSize: 11,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 4,
                cursor: "pointer",
              }}
              title="Reculer de 30 secondes"
            >
              <RotateCcw size={14} />
              <span>-30s</span>
            </button>

            {/* Recul 15s */}
            <button
              type="button"
              onClick={() => handleRewind(15)}
              style={{
                background: "rgba(255, 255, 255, 0.08)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                color: "#fff",
                borderRadius: 8,
                padding: "6px 9px",
                fontSize: 11,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 4,
                cursor: "pointer",
              }}
              title="Reculer de 15 secondes"
            >
              <RotateCcw size={14} />
              <span>-15s</span>
            </button>

            {/* Avance 15s */}
            <button
              type="button"
              onClick={() => handleForward(15)}
              disabled={!isDelayed}
              style={{
                background: "rgba(255, 255, 255, 0.08)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                color: isDelayed ? "#fff" : "rgba(255,255,255,0.3)",
                borderRadius: 8,
                padding: "6px 9px",
                fontSize: 11,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 4,
                cursor: isDelayed ? "pointer" : "default",
              }}
              title="Avancer de 15 secondes"
            >
              <span>+15s</span>
              <RotateCw size={14} />
            </button>

            {/* Son */}
            <button
              type="button"
              onClick={toggleMute}
              style={{
                background: "transparent",
                border: "none",
                color: isMuted ? "var(--muted, #9aa2ae)" : "#fff",
                padding: 6,
                cursor: "pointer",
                display: "grid",
                placeItems: "center",
              }}
              title={isMuted ? "Activer le son (M)" : "Couper le son (M)"}
            >
              {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
          </div>

          {/* Côté droit : Indicateur de différé / Bouton Direct, Bouton Replay Serveur, Plein écran */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Si différé, bouton pour revenir au direct */}
            {isDelayed && (
              <button
                type="button"
                onClick={handleReturnToLive}
                style={{
                  background: "#ff9500",
                  color: "#000",
                  border: "none",
                  borderRadius: 6,
                  padding: "5px 10px",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
                title="Raccrocher le flux direct"
              >
                <span>DIRECT</span>
                <span style={{ fontSize: 10, opacity: 0.85 }}>({formatDelay(delaySeconds)})</span>
              </button>
            )}

            {/* Bouton Replay / Timeshift serveur si disponible */}
            {hasTimeshiftArchive && onOpenTimeshiftMenu && (
              <button
                type="button"
                onClick={onOpenTimeshiftMenu}
                style={{
                  background: "rgba(217, 255, 82, 0.14)",
                  border: "1px solid var(--accent, #d9ff52)",
                  color: "var(--accent, #d9ff52)",
                  borderRadius: 6,
                  padding: "5px 10px",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
                title="Choisir un point de départ plus ancien sur le serveur"
              >
                <History size={13} />
                <span>Replay Serveur</span>
              </button>
            )}

            {/* Bouton Plein écran */}
            <button
              type="button"
              onClick={handleToggleFullscreen}
              style={{
                background: "transparent",
                border: "none",
                color: "#fff",
                padding: 6,
                cursor: "pointer",
                display: "grid",
                placeItems: "center",
              }}
              title={isFullscreen ? "Quitter le plein écran (F)" : "Plein écran (F)"}
            >
              {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
