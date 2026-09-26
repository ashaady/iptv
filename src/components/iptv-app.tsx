"use client";

/* eslint-disable react/no-unescaped-entities, @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */

import {
  Check, ChevronDown, ChevronRight, Clapperboard,
  Download, Expand, ExternalLink, Eye, EyeOff, Film, Folder, Globe, Heart, History, Home, Languages,
  LogOut, Pause, PictureInPicture, Play, Plus, Radio,
  RefreshCw, Search, Server, Settings, ShieldAlert, ShieldCheck,
  SlidersHorizontal, Sparkles, Star, Subtitles, Trash2, Tv, User, Volume2, VolumeX, X, Zap,
  ArrowLeft, Pin, Info, RotateCw, ListVideo, Maximize2,
} from "lucide-react";
import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { fluxaApi, isApiConfigured } from "@/lib/api";
import type {
  Profile,
  LiveCategory,
  LiveStream,
  VodCategory,
  VodMovie,
  SeriesItem,
  SearchResults,
} from "@/lib/api";
import dynamic from "next/dynamic";

const LivePlayer = dynamic(
  () => import("./live-player").then((mod) => mod.LivePlayer),
  {
    ssr: false,
    loading: () => (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", width: "100%", background: "#000", color: "var(--muted)", gap: 10 }}>
        <RefreshCw className="spin" size={20} />
        <span style={{ fontSize: 13 }}>Chargement du lecteur vidéo...</span>
      </div>
    ),
  }
);

class PlayerErrorBoundary extends Component<
  { children: ReactNode; onRetry?: () => void },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; onRetry?: () => void }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("[PlayerErrorBoundary] Erreur capturée:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", width: "100%", background: "#090b0e", color: "#fff", gap: 14, padding: 24, textAlign: "center" }}>
          <Tv size={36} style={{ color: "var(--accent)" }} />
          <div>
            <strong style={{ fontSize: 15, display: "block", marginBottom: 4 }}>Le lecteur vidéo a rencontré un problème</strong>
            <p style={{ color: "var(--muted)", fontSize: 12, maxWidth: 360, margin: 0 }}>
              Le module de lecture n'a pas pu être chargé. Vous pouvez réessayer ou ouvrir le flux dans VLC.
            </p>
          </div>
          <button
            className="button button-primary compact"
            onClick={() => {
              this.setState({ hasError: false });
              if (this.props.onRetry) this.props.onRetry();
            }}
          >
            <RefreshCw size={14} /> Recharger le lecteur
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

class SafeViewErrorBoundary extends Component<
  { children: ReactNode; onReset?: () => void },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode; onReset?: () => void }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error("[SafeViewErrorBoundary] Erreur capturée:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "60vh",
          padding: 32,
          textAlign: "center",
          color: "#94a3b8",
          gap: 16
        }}>
          <Tv size={42} style={{ color: "#f4384f", opacity: 0.6 }} />
          <div>
            <h2 style={{ color: "#fff", fontSize: 18, marginBottom: 6 }}>Affichage temporairement indisponible</h2>
            <p style={{ maxWidth: 440, fontSize: 13, margin: "0 auto", color: "#64748b" }}>
              Une erreur inattendue est survenue lors de l'affichage de cette vue.
            </p>
          </div>
          <button
            className="button button-primary"
            style={{ padding: "8px 20px", fontSize: 13, cursor: "pointer" }}
            onClick={() => {
              this.setState({ hasError: false, error: null });
              this.props.onReset?.();
            }}
          >
            Retourner à l'accueil
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const ADULT_KEYWORDS = [
  "xxx", "+18", "18+", "porn", "playboy", "brazzers", "dorcel",
  "hustler", "penthouse", "vivid", "redlight", "red light", "erotic", "erotik",
  "evilangel", "evil angel", "centoxcento", "babes", "bangbros", "private tv",
  "for adult", "erotique", "sexe", "xxl", "x-rated", "colmax", "man-x", "passie xxx",
  "pink o", "superone", "legalporno", "nuart", "taboo", "teleclube", "tgirls",
  "french lover", "libidofun", "libido", "beate-uhse", "blue hustler", "milenia",
  "dusk tv", "porno", "hardcore"
];

const ADULT_EXCLUDES = [
  "adult swim", "passion bollywood", "rtl passion", "sex and the city",
  "sex education", "prosieben maxx", "show maxx", "rmf maxxx", "pain hustlers",
  "landlust", "jasmine sandlas", "unbeaten", "sctv", "wanderlust", "district",
  "disctrict", "xander cage", "state of the union", "triple x", "battle of the sexes",
  "hardcore pawn", "pawn", "aporna", "hardcore henry", "hardcore power", "hardcoreradio"
];

function isAdultCategory(cat: { category_id?: string; category_name?: string } | null | undefined): boolean {
  if (!cat) return false;
  const id = String(cat.category_id || "");
  if (id === "16" || id === "382" || id === "adult_all") return true;
  const name = String(cat.category_name || "").toLowerCase();
  if (ADULT_EXCLUDES.some((ex) => name.includes(ex))) return false;
  return ADULT_KEYWORDS.some((kw) => name.includes(kw)) || /\b(adult|adulte|porn|xxx|\+18|18\+)\b/i.test(name);
}

function isAdultItem(item: { name?: string; title?: string; is_adult?: string | number | boolean; category_id?: string } | null | undefined): boolean {
  if (!item) return false;
  if (String(item.is_adult) === "1" || item.is_adult === true || String(item.is_adult).toLowerCase() === "true") return true;
  const id = String(item.category_id || "");
  if (id === "16" || id === "382") return true;
  const name = String(item.name || item.title || "").toLowerCase();
  if (ADULT_EXCLUDES.some((ex) => name.includes(ex))) return false;
  return ADULT_KEYWORDS.some((kw) => name.includes(kw)) || /\b(adult|adulte|porn|xxx|\+18|18\+)\b/i.test(name);
}

type View = "home" | "live" | "movies" | "series" | "favorites" | "history" | "search" | "settings";
type MediaType = "film" | "série";

type Media = {
  id: string; title: string; type: MediaType; year: number; genre: string;
  rating: number; duration: string; progress?: number; episode?: string;
  palette: string; monogram: string; poster?: string;
};

type Channel = {
  id: string; name: string; group: string; logo: string; color: string;
  now: string; next: string; time: string; progress: number;
};

export interface HistoryItem {
  id: string;
  category: "channels" | "movies" | "series";
  title: string;
  subtitle: string;
  badge?: string;
  poster?: string;
  logo?: string;
  timestamp: number;
  progress?: number;
  duration?: string;
  stream_id?: number | string;
  container_extension?: string;
  rawStream?: LiveStream;
  rawMovie?: VodMovie;
  rawSeries?: SeriesItem;
  rawDemoChannel?: Channel;
}

const initialHistoryItems: HistoryItem[] = [
  // Chaînes en direct
  {
    id: "init_ch_1",
    category: "channels",
    title: "TF1 HD",
    subtitle: "Le Journal de 20 Heures · En direct",
    badge: "DIRECT",
    logo: "/assets/tf1.png",
    timestamp: Date.now() - 1000 * 60 * 15,
  },
  {
    id: "init_ch_2",
    category: "channels",
    title: "Canal+ Sport HD",
    subtitle: "UEFA Champions League · Soirée Direct",
    badge: "DIRECT",
    logo: "/assets/canal.png",
    timestamp: Date.now() - 1000 * 60 * 90,
  },
  {
    id: "init_ch_3",
    category: "channels",
    title: "BeIN Sports 1",
    subtitle: "Liga Santander · Multiplex Choc",
    badge: "DIRECT",
    logo: "/assets/bein.png",
    timestamp: Date.now() - 1000 * 60 * 60 * 5,
  },
  {
    id: "init_ch_4",
    category: "channels",
    title: "M6 HD",
    subtitle: "Zone Interdite · Émission Spéciale",
    badge: "DIRECT",
    logo: "/assets/m6.png",
    timestamp: Date.now() - 1000 * 60 * 60 * 24,
  },
  {
    id: "init_ch_5",
    category: "channels",
    title: "RMC Sport 1",
    subtitle: "Premier League Live · Arsenal vs City",
    badge: "DIRECT",
    logo: "/assets/rmc.png",
    timestamp: Date.now() - 1000 * 60 * 60 * 36,
  },

  // Films
  {
    id: "init_mov_1",
    category: "movies",
    title: "Dune : Deuxième Partie",
    subtitle: "2024 · Science-fiction · Denis Villeneuve",
    badge: "★ 8.9",
    poster: "/assets/dune.jpg",
    progress: 65,
    duration: "2 h 46",
    timestamp: Date.now() - 1000 * 60 * 45,
  },
  {
    id: "init_mov_2",
    category: "movies",
    title: "Oppenheimer",
    subtitle: "2023 · Historique / Biopic · Christopher Nolan",
    badge: "★ 8.9",
    poster: "/assets/opp.jpg",
    progress: 42,
    duration: "3 h 00",
    timestamp: Date.now() - 1000 * 60 * 60 * 18,
  },
  {
    id: "init_mov_3",
    category: "movies",
    title: "Gladiator II",
    subtitle: "2024 · Action épique · Ridley Scott",
    badge: "★ 8.1",
    poster: "/assets/glad.jpg",
    progress: 85,
    duration: "2 h 28",
    timestamp: Date.now() - 1000 * 60 * 60 * 48,
  },
  {
    id: "init_mov_4",
    category: "movies",
    title: "Interstellar",
    subtitle: "2014 · Aventure spatiale · Christopher Nolan",
    badge: "★ 8.7",
    poster: "/assets/inter.jpg",
    progress: 100,
    duration: "2 h 49",
    timestamp: Date.now() - 1000 * 60 * 60 * 72,
  },
  {
    id: "init_mov_5",
    category: "movies",
    title: "The Batman",
    subtitle: "2022 · Action / Thriller · Matt Reeves",
    badge: "★ 7.8",
    poster: "/assets/batman.jpg",
    progress: 25,
    duration: "2 h 56",
    timestamp: Date.now() - 1000 * 60 * 60 * 96,
  },

  // Séries
  {
    id: "init_ser_1",
    category: "series",
    title: "The Last of Us",
    subtitle: "Saison 1 · Épisode 4 : 'Please Hold to My Hand'",
    badge: "S1 · E4",
    poster: "/assets/hero.jpg",
    progress: 80,
    duration: "55 min",
    timestamp: Date.now() - 1000 * 60 * 30,
  },
  {
    id: "init_ser_2",
    category: "series",
    title: "House of the Dragon",
    subtitle: "Saison 2 · Épisode 1 : 'Un fils pour un fils'",
    badge: "S2 · E1",
    poster: "/assets/glad.jpg",
    progress: 55,
    duration: "64 min",
    timestamp: Date.now() - 1000 * 60 * 60 * 12,
  },
  {
    id: "init_ser_3",
    category: "series",
    title: "Succession",
    subtitle: "Saison 4 · Épisode 10 : Final de la série",
    badge: "S4 · E10",
    poster: "/assets/john.jpg",
    progress: 92,
    duration: "88 min",
    timestamp: Date.now() - 1000 * 60 * 60 * 50,
  },
];

const navItems: { id: View; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Accueil", icon: Home },
  { id: "live", label: "TV en direct", icon: Tv },
  { id: "movies", label: "Films", icon: Film },
  { id: "series", label: "Séries", icon: Clapperboard },
  { id: "favorites", label: "Favoris", icon: Heart },
  { id: "history", label: "Historique", icon: History },
];

const media: Media[] = [
  { id: "m1", title: "Dune: Deuxième Partie", type: "film", year: 2024, genre: "Science-fiction", rating: 8.9, duration: "2 h 46", progress: 65, palette: "sunset", monogram: "D2", poster: "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&auto=format&fit=crop&q=80" },
  { id: "m2", title: "Oppenheimer", type: "film", year: 2023, genre: "Historique / Biopic", rating: 8.9, duration: "3 h 00", progress: 42, palette: "ember", monogram: "OP", poster: "https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=600&auto=format&fit=crop&q=80" },
  { id: "m3", title: "Interstellar", type: "film", year: 2014, genre: "Aventure spatiale", rating: 8.7, duration: "2 h 49", palette: "ocean", monogram: "IS", poster: "https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?w=600&auto=format&fit=crop&q=80" },
  { id: "m4", title: "The Last of Us", type: "série", year: 2023, genre: "Post-Apocalyptique", rating: 8.8, duration: "9 épisodes", progress: 80, episode: "S1 · E4", palette: "lime", monogram: "TL", poster: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600&auto=format&fit=crop&q=80" },
  { id: "m5", title: "Blade Runner 2049", type: "film", year: 2017, genre: "Cyberpunk", rating: 8.5, duration: "2 h 44", palette: "sand", monogram: "BR", poster: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80" },
  { id: "m6", title: "Gladiator II", type: "film", year: 2024, genre: "Action épique", rating: 8.1, duration: "2 h 28", palette: "gold", monogram: "G2", poster: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80" },
  { id: "m7", title: "Succession", type: "série", year: 2023, genre: "Drame", rating: 8.9, duration: "4 saisons", episode: "S4 · E10", palette: "rose", monogram: "SU", poster: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=600&auto=format&fit=crop&q=80" },
  { id: "m8", title: "Top Gun: Maverick", type: "film", year: 2022, genre: "Action", rating: 8.3, duration: "2 h 11", palette: "steel", monogram: "TG", poster: "https://images.unsplash.com/photo-1519074069444-1ba4ea16e919?w=600&auto=format&fit=crop&q=80" },
];

const channels: Channel[] = [
  { id: "c1", name: "Canal+ Sport HD", group: "Sport", logo: "C+", color: "#22c55e", now: "UEFA Champions League · Soirée Direct", next: "Le Grand Débrief Foot", time: "20:45 – 23:00", progress: 68 },
  { id: "c2", name: "BeIN Sports 1", group: "Sport", logo: "bIN", color: "#8b5cf6", now: "Liga Santander · Real Madrid vs Barca", next: "Club du Dimanche", time: "20:30 – 22:30", progress: 45 },
  { id: "c3", name: "TF1 4K UHD", group: "Généraliste", logo: "TF1", color: "#3b82f6", now: "Le Journal de 20 Heures", next: "Grand Film du Dimanche", time: "20:00 – 20:45", progress: 85 },
  { id: "c4", name: "Canal+ Cinéma", group: "Cinéma", logo: "C+", color: "#ec4899", now: "Oppenheimer (2023)", next: "Killers of the Flower Moon", time: "21:00 – 23:55", progress: 30 },
  { id: "c5", name: "RMC Sport 1", group: "Sport", logo: "RMC", color: "#ef4444", now: "Premier League Live · Arsenal vs City", next: "PL Zone Analysis", time: "20:45 – 22:45", progress: 55 },
  { id: "c6", name: "France 2 HD", group: "Généraliste", logo: "F2", color: "#f97316", now: "Envoyé Spécial", next: "Complément d'Enquête", time: "21:10 – 23:00", progress: 25 },
];

const categories = ["Toutes", "Sport", "Cinéma", "Généraliste", "Information", "Documentaire", "Jeunesse", "Musique"];

function MediaArtwork({ item, wide = false }: { item: Media; wide?: boolean }) {
  if (item.poster) {
    return (
      <div className={`artwork ${wide ? "artwork-wide" : ""}`} style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#11141a" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.poster} alt={item.title} style={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform 0.3s ease" }} />
      </div>
    );
  }
  return <div className={`artwork artwork-${item.palette} ${wide ? "artwork-wide" : ""}`} aria-hidden="true"><span className="artwork-orbit" /><span className="artwork-monogram">{item.monogram}</span><span className="artwork-grain" /></div>;
}


function Brand({ onClick }: { onClick?: () => void }) {
  return (
    <div className="brand" onClick={onClick} aria-label="Fluxa Player" title="Fluxa Player">
      <div className="brand-fluxa-mark">
        <Tv size={16} strokeWidth={2.6} />
      </div>
    </div>
  );
}

function SafeImage({ src, alt, className, fallbackText }: { src?: string; alt: string; className?: string; fallbackText: string }) {
  const [hasError, setHasError] = useState(false);
  if (!src || hasError) {
    return <span className="artwork-monogram" style={{ fontSize: 13, fontWeight: 800 }}>{(fallbackText || "TV").slice(0, 3).toUpperCase()}</span>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setHasError(true)}
    />
  );
}

export type ActiveProfile = {
  id: string;
  name: string;
  server_url: string;
  username: string;
  status: string;
  expires_at?: string | null;
  isDemo?: boolean;
};

const DEMO_PROFILE: ActiveProfile = {
  id: "demo",
  name: "Mode Démo",
  server_url: "http://demo.fluxa.local",
  username: "Abdou",
  status: "Active",
  expires_at: "2026-12-18",
  isDemo: true,
};

export function IptvApp() {
  const [activeProfile, setActiveProfile] = useState<ActiveProfile | null>(null);
  const [view, setView] = useState<View>("home");
  const [selectedDetailMedia, setSelectedDetailMedia] = useState<any | null>(null);
  const [cinemaPlayerState, setCinemaPlayerState] = useState<{
    type: "live" | "movie" | "series";
    title: string;
    videoUrl: string;
    streamId?: string | number;
    channel?: LiveStream;
    movie?: VodMovie;
    series?: SeriesItem;
    seasonNum?: string | number;
    episode?: any;
  } | null>(null);
  const [pinnedCategoryIds, setPinnedCategoryIds] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const s = window.localStorage.getItem("fluxa_pinned_cats");
        if (s) return JSON.parse(s);
      } catch {}
    }
    return ["159", "68", "557"];
  });

  const handleTogglePinCategory = useCallback((catId: string) => {
    setPinnedCategoryIds((prev) => {
      const next = prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId];
      try {
        window.localStorage.setItem("fluxa_pinned_cats", JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const [, setMobileMenu] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Toutes");
  const [selectedChannel, setSelectedChannel] = useState(channels[1]);
  const [isPlaying, setIsPlaying] = useState(true);
  const [favorites, setFavorites] = useState<string[]>(["m2", "m6", "c2"]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [toast, setToast] = useState("");
  const [synced, setSynced] = useState("Aujourd'hui, 20:42");

  // Données IPTV Réelles
  const [liveCategories, setLiveCategories] = useState<LiveCategory[]>([]);
  const [selectedLiveCat, setSelectedLiveCat] = useState<string>("");
  const [liveStreams, setLiveStreams] = useState<LiveStream[]>([]);
  const [selectedStream, setSelectedStream] = useState<LiveStream | null>(null);
  const [loadingStreams, setLoadingStreams] = useState(false);

  const [vodCategories, setVodCategories] = useState<VodCategory[]>([]);
  const [selectedVodCat, setSelectedVodCat] = useState<string>("all");
  const [vodMovies, setVodMovies] = useState<VodMovie[]>([]);
  const [allVodMovies, setAllVodMovies] = useState<VodMovie[]>([]);
  const [loadingMovies, setLoadingMovies] = useState(false);

  const [seriesCategories, setSeriesCategories] = useState<VodCategory[]>([]);
  const [selectedSeriesCat, setSelectedSeriesCat] = useState<string>("all");
  const [seriesList, setSeriesList] = useState<SeriesItem[]>([]);
  const [allSeriesList, setAllSeriesList] = useState<SeriesItem[]>([]);
  const [loadingSeries, setLoadingSeries] = useState(false);

  const [playingMovie, setPlayingMovie] = useState<VodMovie | null>(null);
  const [selectedSeriesForModal, setSelectedSeriesForModal] = useState<SeriesItem | null>(null);
  const [searchResultsReal, setSearchResultsReal] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  // Contrôle parental & contenu adulte (+18)
  const [showAdult, setShowAdult] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = window.localStorage.getItem("fluxa-show-adult");
        if (saved !== null) return saved === "true";
      } catch {}
    }
    return true;
  });

  const handleToggleAdult = (val: boolean) => {
    setShowAdult(val);
    try {
      window.localStorage.setItem("fluxa-show-adult", String(val));
    } catch {}
    setToast(val ? "Contenu adulte (+18) activé 🔞" : "Contenu adulte masqué 🛡️");
  };

  // Historique de visionnage (Chaînes, Films, Séries)
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = window.localStorage.getItem("fluxa_watch_history");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch {}
    }
    return initialHistoryItems;
  });

  // Gestion des chaînes favorites complètes (avec logos et métadonnées)
  const [favoriteChannelsMap, setFavoriteChannelsMap] = useState<Record<string, LiveStream>>({});
  const favoriteChannelIds = useMemo(() => Object.keys(favoriteChannelsMap), [favoriteChannelsMap]);
  const favoriteChannelsList = useMemo(() => Object.values(favoriteChannelsMap), [favoriteChannelsMap]);

  // Gestion des chaînes actives fonctionnelles vérifiées (qui fonctionnent à 100%)
  const [activeChannelsMap, setActiveChannelsMap] = useState<Record<string, LiveStream>>({});
  const activeChannelIds = useMemo(() => Object.keys(activeChannelsMap), [activeChannelsMap]);
  const activeChannelsList = useMemo(() => Object.values(activeChannelsMap), [activeChannelsMap]);

  // Chargement des chaînes actives depuis localStorage et synchronisation SQLite
  useEffect(() => {
    if (!activeProfile?.id) return;
    const storageKey = `fluxa_active_channels_${activeProfile.id}`;
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) {
        setActiveChannelsMap(JSON.parse(saved));
      }
    } catch {}

    if (!activeProfile.isDemo) {
      fluxaApi.live.activeChannels.list(activeProfile.id)
        .then((dbChannels) => {
          if (Array.isArray(dbChannels) && dbChannels.length > 0) {
            setActiveChannelsMap((prev) => {
              const merged = { ...prev };
              let added = false;
              for (const ch of dbChannels) {
                if (ch?.stream_id && !merged[String(ch.stream_id)]) {
                  merged[String(ch.stream_id)] = ch;
                  added = true;
                }
              }
              if (added) {
                try {
                  window.localStorage.setItem(storageKey, JSON.stringify(merged));
                } catch {}
              }
              return merged;
            });
          }
        })
        .catch(() => {});
    }
  }, [activeProfile?.id, activeProfile?.isDemo]);

  const markChannelActive = useCallback((stream: LiveStream) => {
    if (!activeProfile?.id || !stream?.stream_id) return;
    setActiveChannelsMap((prev) => {
      const idStr = String(stream.stream_id);
      if (prev[idStr]) return prev;
      const next = { ...prev, [idStr]: stream };
      try {
        window.localStorage.setItem(`fluxa_active_channels_${activeProfile.id}`, JSON.stringify(next));
      } catch {}
      return next;
    });
    if (!activeProfile.isDemo) {
      fluxaApi.live.activeChannels.save(activeProfile.id, [stream]).catch(() => {});
    }
  }, [activeProfile?.id, activeProfile?.isDemo]);

  const markChannelsActiveBatch = useCallback((streams: LiveStream[]) => {
    if (!activeProfile?.id || streams.length === 0) return;
    setActiveChannelsMap((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const s of streams) {
        const idStr = String(s.stream_id);
        if (!next[idStr]) {
          next[idStr] = s;
          changed = true;
        }
      }
      if (!changed) return prev;
      try {
        window.localStorage.setItem(`fluxa_active_channels_${activeProfile.id}`, JSON.stringify(next));
      } catch {}
      return next;
    });
    if (!activeProfile.isDemo) {
      fluxaApi.live.activeChannels.save(activeProfile.id, streams).catch(() => {});
    }
  }, [activeProfile?.id, activeProfile?.isDemo]);

  const markChannelInactive = useCallback((streamId: string | number) => {
    if (!activeProfile?.id || !streamId) return;
    setActiveChannelsMap((prev) => {
      const idStr = String(streamId);
      if (!prev[idStr]) return prev;
      const next = { ...prev };
      delete next[idStr];
      try {
        window.localStorage.setItem(`fluxa_active_channels_${activeProfile.id}`, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, [activeProfile?.id]);

  useEffect(() => {
    let cancelled = false;
    setIsDesktop(Boolean(typeof window !== "undefined" && window.desktopApi?.isDesktop));
    try {
      const saved = window.localStorage.getItem("fluxa-favorites");
      if (saved) setFavorites(JSON.parse(saved));
    } catch {
      // ignore
    }

    const restoreProfile = async () => {
      try {
        const savedProfile = window.localStorage.getItem("fluxa-active-profile");
        if (!savedProfile) return;
        const profile = JSON.parse(savedProfile) as ActiveProfile;
        if (!profile || typeof profile.id !== "string") {
          window.localStorage.removeItem("fluxa-active-profile");
          return;
        }
        if (profile.isDemo) {
          if (!cancelled) setActiveProfile(profile);
          return;
        }

        const profiles = await fluxaApi.profiles.list();
        if (cancelled) return;
        const current = profiles.find((item) => item.id === profile.id);
        if (!current) {
          window.localStorage.removeItem("fluxa-active-profile");
          window.localStorage.removeItem("fluxa-profile-id");
          setToast("Ce profil n'existe plus sur ce backend. Reconnectez-vous.");
          return;
        }
        const restored: ActiveProfile = { ...current, isDemo: false };
        window.localStorage.setItem("fluxa-active-profile", JSON.stringify(restored));
        setActiveProfile(restored);
      } catch (error) {
        // Une panne temporaire du backend ne doit pas effacer un profil valide.
        console.warn("Impossible de vérifier le profil enregistré:", error);
      }
    };
    void restoreProfile();
    return () => { cancelled = true; };
  }, []);

  // Synchronisation des favoris pour le profil actif (localStorage + SQLite API)
  useEffect(() => {
    if (!activeProfile) return;
    const storageKey = `fluxa-fav-channels-${activeProfile.id}`;

    // 1. Lecture instantanée depuis le localStorage
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as LiveStream[];
        const map: Record<string, LiveStream> = {};
        parsed.forEach((ch) => {
          if (ch && ch.stream_id) map[String(ch.stream_id)] = ch;
        });
        setFavoriteChannelsMap(map);
        setFavorites((prev) => Array.from(new Set([...prev, ...Object.keys(map)])));
      }
    } catch (e) {
      console.error("Erreur lecture favoris locaux:", e);
    }

    // 2. Synchronisation en arrière-plan avec l'API SQLite si profil réel
    if (!activeProfile.isDemo) {
      fluxaApi.favorites.list(activeProfile.id)
        .then((items) => {
          const map: Record<string, LiveStream> = {};
          items.forEach((item) => {
            if (item.content_type === "live" && item.metadata) {
              const stream = item.metadata as unknown as LiveStream;
              if (stream && stream.stream_id) {
                map[String(stream.stream_id)] = stream;
              }
            }
          });
          setFavoriteChannelsMap((prev) => {
            const merged = { ...prev, ...map };
            try {
              window.localStorage.setItem(storageKey, JSON.stringify(Object.values(merged)));
            } catch {}
            return merged;
          });
          setFavorites((prev) => Array.from(new Set([...prev, ...Object.keys(map)])));
        })
        .catch((err) => console.error("Erreur synchronisation favoris backend:", err));
    }
  }, [activeProfile]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Réinitialiser la sélection si une catégorie adulte était active lors de la désactivation du contrôle adulte
  useEffect(() => {
    if (!showAdult) {
      if (selectedLiveCat === "16" || isAdultCategory({ category_id: selectedLiveCat })) {
        const firstClean = liveCategories.find((c) => !isAdultCategory(c));
        setSelectedLiveCat(firstClean ? firstClean.category_id : "");
      }
      if (selectedVodCat === "382" || isAdultCategory({ category_id: selectedVodCat })) {
        setSelectedVodCat("all");
      }
      if (isAdultCategory({ category_id: selectedSeriesCat })) {
        setSelectedSeriesCat("all");
      }
    }
  }, [showAdult, selectedLiveCat, selectedVodCat, selectedSeriesCat, liveCategories]);

  // Chargement des catégories réelles lors de la sélection d'un profil
  useEffect(() => {
    if (!activeProfile || activeProfile.isDemo) return;

    let isMounted = true;
    fluxaApi.live.categories(activeProfile.id)
      .then((cats) => {
        if (!isMounted) return;
        setLiveCategories(cats);
        if (cats.length > 0) {
          const preferred =
            cats.find((c) => pinnedCategoryIds.includes(c.category_id)) ||
            cats.find((c) => /g[eé]n[eé]ral|france|fr\s*\|/i.test(c.category_name)) ||
            cats[0];
          setSelectedLiveCat(preferred.category_id);
        }
      })
      .catch((err) => console.error("Erreur catégories live:", err));

    fluxaApi.vod.categories(activeProfile.id)
      .then((vCats) => {
        if (!isMounted) return;
        setVodCategories(vCats);
      })
      .catch((err) => console.error("Erreur catégories VOD:", err));

    fluxaApi.series.categories(activeProfile.id)
      .then((sCats) => {
        if (!isMounted) return;
        setSeriesCategories(sCats);
      })
      .catch((err) => console.error("Erreur catégories séries:", err));

    return () => {
      isMounted = false;
    };
  }, [activeProfile]);

  // Chargement des flux live de la catégorie sélectionnée
  useEffect(() => {
    if (!activeProfile || activeProfile.isDemo || !selectedLiveCat) return;
    setLoadingStreams(true);
    let isMounted = true;
    fluxaApi.live.streams(activeProfile.id, selectedLiveCat)
      .then((streams) => {
        if (!isMounted) return;
        setLiveStreams(streams);
        if (streams.length > 0) {
          setSelectedStream(streams[0]);
        }
      })
      .catch((err) => console.error("Erreur flux live:", err))
      .finally(() => {
        if (isMounted) setLoadingStreams(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeProfile, selectedLiveCat]);

  // Chargement des films VOD (tous ou par catégorie)
  useEffect(() => {
    if (!activeProfile || activeProfile.isDemo || !selectedVodCat) return;

    // Si sélection "all" et qu'on a déjà tout en mémoire, restauration immédiate
    if (selectedVodCat === "all" && allVodMovies.length > 0) {
      setVodMovies(allVodMovies);
      return;
    }

    // Si catégorie spécifique et qu'on a déjà l'ensemble en mémoire, filtrage instantané sans requête réseau
    if (selectedVodCat !== "all" && allVodMovies.length > 0) {
      const filtered = allVodMovies.filter(
        (m) =>
          String(m.category_id) === String(selectedVodCat) ||
          (Array.isArray((m as any).category_ids) && (m as any).category_ids.map(String).includes(String(selectedVodCat)))
      );
      if (filtered.length > 0) {
        setVodMovies(filtered);
        return;
      }
    }

    setLoadingMovies(true);
    let isMounted = true;
    fluxaApi.vod.movies(activeProfile.id, selectedVodCat === "all" ? undefined : selectedVodCat)
      .then((movies) => {
        if (!isMounted) return;
        setVodMovies(movies);
        if (selectedVodCat === "all") {
          setAllVodMovies(movies);
        }
      })
      .catch((err) => console.error("Erreur films VOD:", err))
      .finally(() => {
        if (isMounted) setLoadingMovies(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeProfile, selectedVodCat, allVodMovies]);

  // Chargement des séries (toutes ou par catégorie)
  useEffect(() => {
    if (!activeProfile || activeProfile.isDemo || !selectedSeriesCat) return;

    // Si sélection "all" et qu'on a déjà tout en mémoire, restauration immédiate
    if (selectedSeriesCat === "all" && allSeriesList.length > 0) {
      setSeriesList(allSeriesList);
      return;
    }

    // Si catégorie spécifique et qu'on a déjà l'ensemble en mémoire, filtrage instantané sans requête réseau
    if (selectedSeriesCat !== "all" && allSeriesList.length > 0) {
      const filtered = allSeriesList.filter(
        (s) =>
          String(s.category_id) === String(selectedSeriesCat) ||
          (Array.isArray((s as any).category_ids) && (s as any).category_ids.map(String).includes(String(selectedSeriesCat)))
      );
      if (filtered.length > 0) {
        setSeriesList(filtered);
        return;
      }
    }

    setLoadingSeries(true);
    let isMounted = true;
    fluxaApi.series.list(activeProfile.id, selectedSeriesCat === "all" ? undefined : selectedSeriesCat)
      .then((series) => {
        if (!isMounted) return;
        setSeriesList(series);
        if (selectedSeriesCat === "all") {
          setAllSeriesList(series);
        }
      })
      .catch((err) => console.error("Erreur séries:", err))
      .finally(() => {
        if (isMounted) setLoadingSeries(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeProfile, selectedSeriesCat, allSeriesList]);

  // Recherche en direct
  useEffect(() => {
    if (!activeProfile || activeProfile.isDemo || !query.trim() || query.length < 2) {
      setSearchResultsReal(null);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fluxaApi.search(activeProfile.id, query.trim());
        setSearchResultsReal(res);
      } catch (err) {
        console.error("Erreur recherche:", err);
      } finally {
        setSearching(false);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [activeProfile, query]);

  const filteredChannels = useMemo(() => channels.filter((channel) => category === "Toutes" || channel.group === category), [category]);
  const searchResults = useMemo(() => {
    const term = query.toLocaleLowerCase("fr").trim();
    if (!term) return [...media.slice(0, 5), ...channels.slice(0, 3)];
    return [
      ...media.filter((item) => `${item.title} ${item.genre}`.toLocaleLowerCase("fr").includes(term)),
      ...channels.filter((item) => `${item.name} ${item.group} ${item.now}`.toLocaleLowerCase("fr").includes(term)),
    ];
  }, [query]);

  function changeView(next: View) { setView(next); setMobileMenu(false); window.scrollTo({ top: 0, behavior: "smooth" }); }

  const addToHistory = useCallback((entry: Omit<HistoryItem, "timestamp">) => {
    setHistoryItems((prev) => {
      const filtered = prev.filter((item) => item.id !== entry.id);
      const next = [{ ...entry, timestamp: Date.now() }, ...filtered].slice(0, 100);
      try {
        window.localStorage.setItem("fluxa_watch_history", JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const handleClearHistory = useCallback(() => {
    setHistoryItems([]);
    try {
      window.localStorage.removeItem("fluxa_watch_history");
    } catch {}
    setToast("Historique entièrement vidé");
  }, []);

  const handleRemoveHistoryItem = useCallback((id: string) => {
    setHistoryItems((prev) => {
      const next = prev.filter((item) => item.id !== id);
      try {
        window.localStorage.setItem("fluxa_watch_history", JSON.stringify(next));
      } catch {}
      return next;
    });
    setToast("Élément retiré de l'historique");
  }, []);

  const handleSelectStream = useCallback((stream: LiveStream) => {
    setSelectedStream(stream);
    addToHistory({
      id: `stream_${stream.stream_id}`,
      category: "channels",
      title: stream.name,
      subtitle: "Chaîne en direct",
      badge: "DIRECT",
      logo: stream.stream_icon,
      stream_id: stream.stream_id,
      rawStream: stream,
    });
  }, [addToHistory]);

  const handlePlayMovie = useCallback((movie: VodMovie) => {
    setPlayingMovie(movie);
    addToHistory({
      id: `movie_${movie.stream_id}`,
      category: "movies",
      title: movie.name,
      subtitle: `${movie.container_extension?.toUpperCase() || "MP4"} · Film VOD`,
      badge: movie.rating_5based ? `★ ${movie.rating_5based}` : "FILM",
      poster: movie.stream_icon,
      stream_id: movie.stream_id,
      container_extension: movie.container_extension,
      progress: 10,
      rawMovie: movie,
    });
  }, [addToHistory]);

  const handleSelectDemoChannel = useCallback((ch: Channel) => {
    setSelectedChannel(ch);
    addToHistory({
      id: `demo_${ch.id}`,
      category: "channels",
      title: ch.name,
      subtitle: `${ch.group} · En direct`,
      badge: "DIRECT",
      logo: ch.logo,
      rawDemoChannel: ch,
    });
  }, [addToHistory]);

  const handleOpenSeriesModal = useCallback((series: SeriesItem) => {
    setSelectedSeriesForModal(series);
  }, []);

  const handlePlaySeriesEpisode = useCallback(
    (series: SeriesItem, episode: any, seasonNum: string | number) => {
      const streamId = episode.id;
      const containerExt = episode.container_extension || "mp4";
      const epTitle = episode.title ? episode.title.trim() : `Épisode ${episode.episode_num || ""}`;
      const seasonBadge = `S${seasonNum} : E${episode.episode_num || ""}`;

      setPlayingMovie({
        stream_id: streamId,
        name: `${series.name} - ${seasonBadge}`,
        stream_icon: episode.info?.movie_image || series.cover,
        container_extension: containerExt,
        rating_5based: series.rating ? Number(series.rating) : undefined,
        kind: "series",
        subtitle: `${series.name} · Saison ${seasonNum} Épisode ${episode.episode_num || ""} · ${epTitle}`,
      } as any);

      addToHistory({
        id: `series_${streamId}`,
        category: "series",
        title: `${series.name} (${seasonBadge})`,
        subtitle: epTitle,
        badge: "SÉRIE",
        poster: episode.info?.movie_image || series.cover,
        stream_id: streamId,
        container_extension: containerExt,
        progress: 5,
      });
    },
    [addToHistory]
  );

  const handleStartCinema = useCallback(
    (state: {
      type: "live" | "movie" | "series";
      title: string;
      videoUrl: string;
      streamId?: string | number;
      channel?: LiveStream;
      movie?: VodMovie;
      series?: SeriesItem;
      seasonNum?: string | number;
      episode?: any;
    }) => {
      setCinemaPlayerState(state);
      if (state.movie) {
        addToHistory({
          id: `movie_${state.movie.stream_id}`,
          category: "movies",
          title: state.movie.name,
          subtitle: `${state.movie.container_extension?.toUpperCase() || "MP4"} · Film VOD`,
          badge: state.movie.rating_5based ? `★ ${state.movie.rating_5based}` : "FILM",
          poster: state.movie.stream_icon,
          stream_id: state.movie.stream_id,
          container_extension: state.movie.container_extension,
          progress: 15,
          rawMovie: state.movie,
        });
      } else if (state.channel) {
        addToHistory({
          id: `stream_${state.channel.stream_id}`,
          category: "channels",
          title: state.channel.name,
          subtitle: "Chaîne en direct",
          badge: "DIRECT",
          logo: state.channel.stream_icon,
          stream_id: state.channel.stream_id,
          rawStream: state.channel,
        });
      } else if (state.series && state.episode) {
        addToHistory({
          id: `series_${state.episode.id}`,
          category: "series",
          title: `${state.series.name} (S${state.seasonNum || 1}E${state.episode.episode_num || ""})`,
          subtitle: state.episode.title || `Épisode ${state.episode.episode_num || ""}`,
          badge: "SÉRIE",
          poster: state.episode.info?.movie_image || state.series.cover,
          stream_id: state.episode.id,
          container_extension: state.episode.container_extension || "mp4",
          progress: 10,
        });
      }
    },
    [addToHistory]
  );

  const handleSelectHomeChannel = useCallback(
    async (tag: string, preferredStreamId?: number, categoryId?: string) => {
      if (!activeProfile) return;

      if (activeProfile.isDemo) {
        const foundDemo = channels.find((c) => c.name.toUpperCase().includes(tag.toUpperCase()));
        if (foundDemo) handleSelectDemoChannel(foundDemo);
        changeView("live");
        return;
      }

      // 1. Chercher si la chaîne est déjà dans le tableau liveStreams courant
      let targetStream = liveStreams.find(
        (s) =>
          (preferredStreamId && s.stream_id === preferredStreamId) ||
          s.name.toUpperCase().includes(tag.toUpperCase())
      );

      // 2. Si non trouvée dans la catégorie courante, charger la catégorie dédiée
      if (!targetStream && preferredStreamId && categoryId) {
        try {
          const catStreams = await fluxaApi.live.streams(activeProfile.id, categoryId);
          targetStream = catStreams.find((s) => s.stream_id === preferredStreamId) || catStreams[0];
          if (targetStream) {
            setSelectedLiveCat(categoryId);
            setLiveStreams(catStreams);
          }
        } catch (err) {
          console.error("Erreur chargement catégorie chaîne:", err);
        }
      }

      // 3. Si toujours non trouvée, recherche globale
      if (!targetStream) {
        try {
          const results = await fluxaApi.search(activeProfile.id, tag, "live");
          if (results && results.results?.live?.length > 0) {
            targetStream =
              results.results.live.find(
                (s) =>
                  s.name.toUpperCase().includes("FR") ||
                  s.name.toUpperCase().includes("FRANCE")
              ) || results.results.live[0];

            if (targetStream && targetStream.category_id) {
              setSelectedLiveCat(String(targetStream.category_id));
              const catStreams = await fluxaApi.live.streams(
                activeProfile.id,
                String(targetStream.category_id)
              );
              setLiveStreams(catStreams);
            }
          }
        } catch (err) {
          console.error("Erreur recherche chaîne live:", err);
        }
      }

      if (targetStream) {
        handleSelectStream(targetStream);
      } else if (liveStreams.length > 0) {
        handleSelectStream(liveStreams[0]);
      }
      changeView("live");
    },
    [activeProfile, liveStreams, handleSelectDemoChannel, handleSelectStream]
  );

  const handleSelectHomeMovie = useCallback(
    async (query: string, preferredStreamId?: number, fallbackMovie?: any) => {
      if (!activeProfile || activeProfile.isDemo) {
        if (fallbackMovie) handlePlayMovie(fallbackMovie);
        return;
      }

      // 1. Chercher en mémoire dans allVodMovies ou vodMovies
      let targetMovie =
        allVodMovies.find((m) => preferredStreamId && m.stream_id === preferredStreamId) ||
        vodMovies.find((m) => preferredStreamId && m.stream_id === preferredStreamId);

      // 2. Si pas trouvé, interroger l'API de recherche
      if (!targetMovie) {
        try {
          const results = await fluxaApi.search(activeProfile.id, query, "movie");
          if (results && results.results?.movies?.length > 0) {
            targetMovie =
              (preferredStreamId &&
                results.results.movies.find((m) => m.stream_id === preferredStreamId)) ||
              results.results.movies.find((m) => m.name.toUpperCase().includes("FR")) ||
              results.results.movies[0];
          }
        } catch (err) {
          console.error("Erreur recherche film:", err);
        }
      }

      if (targetMovie) {
        handlePlayMovie(targetMovie);
      } else if (fallbackMovie) {
        handlePlayMovie(fallbackMovie);
      }
    },
    [activeProfile, allVodMovies, vodMovies, handlePlayMovie]
  );

  const handleSelectHomeSeries = useCallback(
    async (query: string, preferredSeriesId?: number, fallbackSeries?: any) => {
      if (!activeProfile || activeProfile.isDemo) {
        if (fallbackSeries) {
          setSelectedSeriesForModal(fallbackSeries);
        } else {
          changeView("series");
        }
        return;
      }

      // 1. Chercher en mémoire dans allSeriesList ou seriesList
      let targetSeries =
        allSeriesList.find((s) => preferredSeriesId && s.series_id === preferredSeriesId) ||
        seriesList.find((s) => preferredSeriesId && s.series_id === preferredSeriesId);

      // 2. Si pas trouvé, interroger l'API de recherche
      if (!targetSeries) {
        try {
          const results = await fluxaApi.search(activeProfile.id, query, "series");
          if (results && results.results?.series?.length > 0) {
            targetSeries =
              (preferredSeriesId &&
                results.results.series.find((s) => s.series_id === preferredSeriesId)) ||
              results.results.series.find((s) => s.name.toUpperCase().includes("FR")) ||
              results.results.series[0];
          }
        } catch (err) {
          console.error("Erreur recherche série:", err);
        }
      }

      if (targetSeries) {
        setSelectedSeriesForModal(targetSeries);
      } else if (fallbackSeries) {
        setSelectedSeriesForModal(fallbackSeries);
      } else {
        changeView("series");
      }
    },
    [activeProfile, allSeriesList, seriesList]
  );

  function toggleFavorite(id: string) {
    setFavorites((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      window.localStorage.setItem("fluxa-favorites", JSON.stringify(next));
      return next;
    });
    setToast(favorites.includes(id) ? "Retiré des favoris" : "Ajouté aux favoris");
  }

  function toggleFavoriteChannel(stream: LiveStream) {
    if (!activeProfile || !stream) return;
    const streamIdStr = String(stream.stream_id);
    const isFav = Boolean(favoriteChannelsMap[streamIdStr]);
    const storageKey = `fluxa-fav-channels-${activeProfile.id}`;

    setFavoriteChannelsMap((prev) => {
      const next = { ...prev };
      if (isFav) {
        delete next[streamIdStr];
      } else {
        next[streamIdStr] = stream;
      }
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(Object.values(next)));
      } catch {}
      return next;
    });

    setFavorites((prev) => {
      const next = isFav ? prev.filter((id) => id !== streamIdStr) : [...prev, streamIdStr];
      try {
        window.localStorage.setItem("fluxa-favorites", JSON.stringify(next));
      } catch {}
      return next;
    });

    if (!activeProfile.isDemo) {
      if (isFav) {
        fluxaApi.favorites.removeByContent(activeProfile.id, "live", streamIdStr)
          .catch((err) => console.error("Erreur suppression favori backend:", err));
      } else {
        fluxaApi.favorites.add({
          profile_id: activeProfile.id,
          content_type: "live",
          content_id: streamIdStr,
          title: stream.name,
          metadata: stream,
        }).catch((err) => console.error("Erreur ajout favori backend:", err));
      }
    }

    setToast(isFav ? `${stream.name} retiré des favoris` : `${stream.name} ajouté aux favoris ❤️`);
  }

  function refreshData() {
    if (activeProfile && !activeProfile.isDemo) {
      setToast("Actualisation de la playlist en cours...");
      fluxaApi.refreshCatalog(activeProfile.id)
        .then(() => {
          setSynced("À l'instant");
          setToast("Catalogue synchronisé avec le serveur Xtream");
          fluxaApi.live.categories(activeProfile.id)
            .then((cats) => {
              setLiveCategories(cats);
            })
            .catch(console.error);
          fluxaApi.vod.categories(activeProfile.id).then(setVodCategories).catch(console.error);
          fluxaApi.series.categories(activeProfile.id).then(setSeriesCategories).catch(console.error);
          if (selectedLiveCat && selectedLiveCat !== "favorites" && selectedLiveCat !== "all") {
            setLoadingStreams(true);
            fluxaApi.live.streams(activeProfile.id, selectedLiveCat)
              .then(setLiveStreams)
              .catch(console.error)
              .finally(() => setLoadingStreams(false));
          }
        })
        .catch(() => setToast("Erreur de synchronisation"));
    } else {
      setSynced("À l'instant");
      setToast("Catalogue actualisé");
    }
  }

  function handleSelectProfile(prof: ActiveProfile) {
    setActiveProfile(prof);
    try {
      window.localStorage.setItem("fluxa-active-profile", JSON.stringify(prof));
    } catch {
      // ignore
    }
    setView("home");
  }

  function handleDisconnect() {
    setActiveProfile(null);
    try {
      window.localStorage.removeItem("fluxa-active-profile");
    } catch {
      // ignore
    }
    setToast("Retour à la connexion des profils");
  }

  const displayedLiveCategories = useMemo(() => {
    return activeProfile?.isDemo ? [] : (showAdult ? liveCategories : liveCategories.filter((c) => !isAdultCategory(c)));
  }, [activeProfile, liveCategories, showAdult]);

  const displayedLiveStreams = useMemo(() => {
    return activeProfile?.isDemo ? [] : (showAdult ? liveStreams : liveStreams.filter((s) => !isAdultItem(s)));
  }, [activeProfile, liveStreams, showAdult]);

  const displayedFavoriteChannels = useMemo(() => {
    return showAdult ? favoriteChannelsList : favoriteChannelsList.filter((s) => !isAdultItem(s));
  }, [favoriteChannelsList, showAdult]);

  const displayedVodCategories = useMemo(() => {
    return showAdult ? vodCategories : vodCategories.filter((c) => !isAdultCategory(c));
  }, [vodCategories, showAdult]);

  const displayedVodMovies = useMemo(() => {
    return showAdult ? vodMovies : vodMovies.filter((m) => !isAdultItem(m));
  }, [vodMovies, showAdult]);

  const displayedSeriesCategories = useMemo(() => {
    return showAdult ? seriesCategories : seriesCategories.filter((c) => !isAdultCategory(c));
  }, [seriesCategories, showAdult]);

  const displayedSeriesList = useMemo(() => {
    return showAdult ? seriesList : seriesList.filter((s) => !isAdultItem(s));
  }, [seriesList, showAdult]);

  const displayedHistoryItems = useMemo(() => {
    return showAdult ? historyItems : historyItems.filter((h) => !isAdultItem({ name: h.title }));
  }, [historyItems, showAdult]);

  const displayedSearchResultsReal = useMemo(() => {
    if (!searchResultsReal) return null;
    if (showAdult) return searchResultsReal;
    const cleanLive = (searchResultsReal.results?.live || []).filter((i) => !isAdultItem(i));
    const cleanMovies = (searchResultsReal.results?.movies || []).filter((i) => !isAdultItem(i));
    const cleanSeries = (searchResultsReal.results?.series || []).filter((i) => !isAdultItem(i));
    return {
      ...searchResultsReal,
      results: {
        live: cleanLive,
        movies: cleanMovies,
        series: cleanSeries,
      },
      total: cleanLive.length + cleanMovies.length + cleanSeries.length,
    };
  }, [searchResultsReal, showAdult]);

  // Page d'accueil : Écran de connexion au profil Xtream si aucun profil n'est sélectionné
  if (!activeProfile) {
    return (
      <>
        <ProfileConnectScreen
          onSelectProfile={handleSelectProfile}
          onDemoLogin={() => handleSelectProfile(DEMO_PROFILE)}
          setToast={setToast}
        />
        {toast && <div className="toast"><Check size={17} />{toast}</div>}
      </>
    );
  }

  return (
    <div className={`app view-${view}`}>
            {/* Barre latérale ultra-slim Nyx Style avec logo Fluxa */}
      <aside className="sidebar">
        <Brand onClick={() => changeView("home")} />

        <nav className="nav">
          <button
            className={view === "search" ? "nav-link active" : "nav-link"}
            onClick={() => changeView("search")}
            title="Rechercher"
          >
            <span className="ico"><Search size={20} /></span>
          </button>
          <button
            className={view === "home" ? "nav-link active" : "nav-link"}
            onClick={() => changeView("home")}
            title="Accueil"
          >
            <span className="ico"><Home size={20} /></span>
          </button>
          <button
            className={view === "live" ? "nav-link active" : "nav-link"}
            onClick={() => changeView("live")}
            title="TV en direct"
          >
            <span className="ico"><Tv size={20} /></span>
          </button>
          <button
            className={view === "favorites" ? "nav-link active" : "nav-link"}
            onClick={() => changeView("favorites")}
            title="Ma Liste"
          >
            <span className="ico"><Star size={20} /></span>
          </button>
          <button
            className={view === "settings" ? "nav-link active" : "nav-link"}
            onClick={() => changeView("settings")}
            title="Paramètres"
          >
            <span className="ico"><Settings size={20} /></span>
          </button>
        </nav>

        <div className="sidebar-bottom">
          <button
            onClick={handleDisconnect}
            title="Déconnexion"
            aria-label="Déconnexion"
          >
            <LogOut size={19} />
          </button>
        </div>
      </aside>

      <main className="main">
        <div className="content-container" style={{ minHeight: 0, flex: 1 }}>
          <SafeViewErrorBoundary onReset={() => changeView("home")}>
          {view === "home" && (
            <HomeView
              activeProfile={activeProfile}
              changeView={changeView}
              liveStreams={displayedLiveStreams}
              vodMovies={displayedVodMovies}
              seriesList={displayedSeriesList}
              historyItems={displayedHistoryItems}
              onSelectStream={(stream) => {
                handleSelectStream(stream);
                changeView("live");
              }}
              onPlayMovie={handlePlayMovie}
              onSelectHomeChannel={handleSelectHomeChannel}
              onSelectHomeMovie={handleSelectHomeMovie}
              onSelectHomeSeries={handleSelectHomeSeries}
              onOpenSeriesDetail={handleOpenSeriesModal}
              onOpenDetail={(media) => setSelectedDetailMedia(media)}
              onStartCinema={handleStartCinema}
              favorites={favorites}
              toggleFavorite={toggleFavorite}
            />
          )}
          {view === "live" && (
            <LiveView
              activeProfile={activeProfile}
              categories={displayedLiveCategories}
              selectedCategory={selectedLiveCat}
              onSelectCategory={(id) => setSelectedLiveCat(id)}
              streams={
                activeProfile.isDemo
                  ? []
                  : selectedLiveCat === "favorites"
                  ? displayedFavoriteChannels
                  : selectedLiveCat === "active"
                  ? activeChannelsList
                  : displayedLiveStreams
              }
              selectedStream={selectedStream}
              onSelectStream={handleSelectStream}
              onStartCinema={(state) => setCinemaPlayerState(state)}
              pinnedCategoryIds={pinnedCategoryIds}
              onTogglePinCategory={handleTogglePinCategory}
              loading={selectedLiveCat === "favorites" || selectedLiveCat === "active" ? false : loadingStreams}
              demoCategory={category}
              setDemoCategory={setCategory}
              demoChannels={filteredChannels}
              demoSelected={selectedChannel}
              demoSelect={handleSelectDemoChannel}
              demoIsPlaying={isPlaying}
              demoSetIsPlaying={setIsPlaying}
              favorites={favorites}
              toggleFavorite={toggleFavorite}
              favoriteChannelIds={favoriteChannelIds}
              favoriteChannelsList={displayedFavoriteChannels}
              toggleFavoriteChannel={toggleFavoriteChannel}
              activeChannelIds={activeChannelIds}
              activeChannelsList={activeChannelsList}
              markChannelActive={markChannelActive}
              markChannelsActiveBatch={markChannelsActiveBatch}
              markChannelInactive={markChannelInactive}
              showAdult={showAdult}
            />
          )}
          {(view === "movies" || view === "series") && (
            <CatalogView
              type={view === "movies" ? "film" : "série"}
              activeProfile={activeProfile}
              vodCategories={displayedVodCategories}
              selectedVodCategory={selectedVodCat}
              onSelectVodCategory={(id) => setSelectedVodCat(id)}
              seriesCategories={displayedSeriesCategories}
              selectedSeriesCategory={selectedSeriesCat}
              onSelectSeriesCategory={(id) => setSelectedSeriesCat(id)}
              movies={displayedVodMovies}
              series={displayedSeriesList}
              loading={view === "movies" ? loadingMovies : loadingSeries}
              onPlayMovie={handlePlayMovie}
              onOpenSeriesDetail={handleOpenSeriesModal}
              favorites={favorites}
              toggleFavorite={toggleFavorite}
              showAdult={showAdult}
            />
          )}
          {view === "favorites" && (
            <FavoritesView
              activeProfile={activeProfile}
              favoriteChannels={displayedFavoriteChannels}
              onSelectStream={(stream) => {
                handleSelectStream(stream);
                changeView("live");
              }}
              onOpenDetail={(media) => setSelectedDetailMedia(media)}
              onPlayMovie={handlePlayMovie}
              toggleFavoriteChannel={toggleFavoriteChannel}
              changeView={changeView}
              favorites={favorites}
              toggleFavorite={toggleFavorite}
              demoChannels={channels}
              demoSelect={(ch) => {
                handleSelectDemoChannel(ch);
                changeView("live");
              }}
              vodMovies={displayedVodMovies}
              seriesList={displayedSeriesList}
            />
          )}
          {view === "history" && (
            <HistoryView
              historyItems={displayedHistoryItems}
              onClearHistory={handleClearHistory}
              onRemoveItem={handleRemoveHistoryItem}
              onSelectStream={(stream) => {
                handleSelectStream(stream);
                changeView("live");
              }}
              onPlayMovie={handlePlayMovie}
              changeView={changeView}
              liveStreams={displayedLiveStreams}
              vodMovies={displayedVodMovies}
              demoChannels={channels}
              demoSelect={(ch) => {
                handleSelectDemoChannel(ch);
                changeView("live");
              }}
            />
          )}
          {view === "search" && (
            <SearchView
              activeProfile={activeProfile}
              query={query}
              setQuery={setQuery}
              resultsReal={displayedSearchResultsReal}
              searching={searching}
              onSelectStream={(stream) => {
                handleSelectStream(stream);
                changeView("live");
              }}
              onPlayMovie={handlePlayMovie}
              onOpenDetail={(media) => setSelectedDetailMedia(media)}
              onOpenSeriesDetail={handleOpenSeriesModal}
              demoResults={searchResults}
              favorites={favorites}
              toggleFavorite={toggleFavorite}
              favoriteChannelIds={favoriteChannelIds}
              toggleFavoriteChannel={toggleFavoriteChannel}
            />
          )}
          {view === "settings" && (
            <SettingsView
              activeProfile={activeProfile}
              onDisconnect={handleDisconnect}
              synced={synced}
              refreshData={refreshData}
              openProfile={() => setProfileOpen(true)}
              showAdult={showAdult}
              onToggleAdult={handleToggleAdult}
            />
          )}
          </SafeViewErrorBoundary>
        </div>
      </main>

      {/* Modal Détails Série (Saisons et Épisodes) */}
      {selectedSeriesForModal && (
        <SeriesDetailModal
          series={selectedSeriesForModal}
          activeProfile={activeProfile}
          onClose={() => setSelectedSeriesForModal(null)}
          onPlayEpisode={handlePlaySeriesEpisode}
        />
      )}

      {/* Lecteur vidéo modal pour les films VOD et épisodes de séries */}
      {playingMovie && (
        <div
          className="modal-video-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setPlayingMovie(null)}
        >
          <div className="modal-video-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-video-header">
              <div className="modal-video-title-wrap">
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <h2 className="modal-video-title">{playingMovie.name}</h2>
                    <span className="modal-video-badge">
                      {(playingMovie as any).kind === "series"
                        ? "SÉRIE"
                        : playingMovie.container_extension?.toUpperCase() || "MP4 4K"}
                    </span>
                  </div>
                  <small className="modal-video-sub">
                    {(playingMovie as any).subtitle ||
                      (activeProfile.isDemo ? "Mode démo haute définition" : `Profil : ${activeProfile.name}`)}
                    {playingMovie.rating_5based ? ` • ★ ${playingMovie.rating_5based}` : ""}
                  </small>
                </div>
              </div>
              <div className="modal-video-actions">
                {isDesktop && (
                  <button
                    className="button button-ghost compact"
                    style={{ fontSize: 12, padding: "5px 10px", gap: 5 }}
                    onClick={() => {
                      const videoSrc =
                        (playingMovie as any).videoUrl ||
                        (!activeProfile.isDemo && playingMovie.stream_id
                          ? fluxaApi.streamUrl(
                              activeProfile.id,
                              ((playingMovie as any).kind || "movie") as any,
                              playingMovie.stream_id,
                              playingMovie.container_extension || "mp4"
                            )
                          : "");
                      if (videoSrc && window.desktopApi?.openInVlc) {
                        window.desktopApi.openInVlc(videoSrc, playingMovie.name);
                      }
                    }}
                    title="Lire avec le lecteur externe VLC"
                  >
                    <ExternalLink size={14} /> Lire dans VLC
                  </button>
                )}
                <button
                  className="modal-video-close"
                  onClick={() => setPlayingMovie(null)}
                  aria-label="Fermer (Échap)"
                  title="Fermer (Échap)"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="modal-video-body">
              <video
                controls
                autoPlay
                playsInline
                poster={playingMovie.stream_icon}
                src={
                  (playingMovie as any).videoUrl ||
                  (!activeProfile.isDemo && playingMovie.stream_id
                    ? fluxaApi.streamUrl(
                        activeProfile.id,
                        ((playingMovie as any).kind || "movie") as any,
                        playingMovie.stream_id,
                        playingMovie.container_extension || "mp4"
                      )
                    : "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4")
                }
              />
            </div>
          </div>
        </div>
      )}

      <nav className="mobile-nav" aria-label="Navigation mobile">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isFav = item.id === "favorites";
          const badgeCount = isFav ? favoriteChannelIds.length : 0;
          return (
            <button
              key={item.id}
              className={view === item.id ? "active" : ""}
              onClick={() => changeView(item.id)}
              style={{ position: "relative" }}
            >
              <Icon size={20} />
              {badgeCount > 0 && (
                <span className="nav-badge-bubble" style={{ top: 2, right: 12 }}>{badgeCount}</span>
              )}
              <span>{item.label.replace("TV en direct", "Direct")}</span>
            </button>
          );
        })}
        <button className={view === "search" ? "active" : ""} onClick={() => changeView("search")}><Search size={20} /><span>Recherche</span></button>
      </nav>
      {profileOpen && <ProfileDialog close={() => setProfileOpen(false)} showPassword={showPassword} setShowPassword={setShowPassword} setToast={setToast} />}
      {toast && <div className="toast"><Check size={17} />{toast}</div>}

      {/* Modal Détail Film / Série (Design Fluxa / Nyx) */}
      {selectedDetailMedia && (
        <MediaDetailView
          media={selectedDetailMedia}
          onClose={() => setSelectedDetailMedia(null)}
          onPlay={(m) => {
            const isSeries = m.kind === "series" || Boolean(m.series_id) || Boolean(m.episode);
            const streamId = m.stream_id || m.episode?.id || m.id || 101;
            const containerExt = m.container_extension || m.episode?.container_extension || "mp4";
            const videoUrl = m.videoUrl || (activeProfile.isDemo ? "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4" : fluxaApi.streamUrl(activeProfile.id, isSeries ? "series" : "movie", streamId, containerExt));
            handleStartCinema({
              type: isSeries ? "series" : "movie",
              title: m.name || m.title || "Lecture",
              videoUrl,
              streamId,
              movie: !isSeries ? m : undefined,
              series: isSeries ? m : undefined,
              seasonNum: m.seasonNum || 1,
              episode: m.episode,
            });
            setSelectedDetailMedia(null);
          }}
          favorites={favorites}
          toggleFavorite={toggleFavorite}
          activeProfile={activeProfile}
          allMovies={displayedVodMovies}
          allSeries={displayedSeriesList}
        />
      )}

      {/* Lecteur Cinéma plein écran avec tiroirs interactifs */}
      {cinemaPlayerState && (
        <CinemaPlayerModal
          playerState={cinemaPlayerState}
          onClose={() => setCinemaPlayerState(null)}
          activeProfile={activeProfile}
          allChannels={displayedLiveStreams}
          onPlaybackSuccess={() => {
            if (cinemaPlayerState.channel) {
              markChannelActive(cinemaPlayerState.channel);
            }
          }}
          onPlaybackError={() => {
            if (cinemaPlayerState.streamId) {
              markChannelInactive(cinemaPlayerState.streamId);
            }
          }}
          onSelectChannel={(ch) => {
            const url = activeProfile.isDemo
              ? "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
              : fluxaApi.streamUrl(activeProfile.id, "live", ch.stream_id, "ts");
            setCinemaPlayerState({
              type: "live",
              title: ch.name,
              videoUrl: url,
              streamId: ch.stream_id,
              channel: ch,
            });
          }}
          onSelectEpisode={(ser, ep, sNum) => {
            const streamId = ep.id;
            const containerExt = ep.container_extension || "mp4";
            const url = activeProfile.isDemo
              ? "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4"
              : fluxaApi.streamUrl(activeProfile.id, "series", streamId, containerExt);
            setCinemaPlayerState({
              type: "series",
              title: `${ser.name} - S${sNum}E${ep.episode_num || ""}`,
              videoUrl: url,
              streamId,
              series: ser,
              episode: ep,
              seasonNum: sNum,
            });
          }}
          favoriteChannelIds={favoriteChannelIds}
          toggleFavoriteChannel={toggleFavoriteChannel}
        />
      )}
    </div>
  );
}


/* ==========================================================================
   MEDIA DETAIL VIEW (Full-Screen Movie / Series Detail in Nyx / Fluxa Style)
   ========================================================================== */
function MediaDetailView({
  media,
  onClose,
  onPlay,
  favorites,
  toggleFavorite,
  activeProfile,
  allMovies = [],
  allSeries = [],
}: {
  media: any;
  onClose: () => void;
  onPlay: (media: any) => void;
  favorites: string[];
  toggleFavorite: (id: string) => void;
  activeProfile: ActiveProfile;
  allMovies?: VodMovie[];
  allSeries?: SeriesItem[];
}) {
  const isSeries = media.kind === "series" || Boolean(media.series_id) || Boolean(media.seasons) || Boolean(media.episode);
  const mediaId = String(media.stream_id || media.series_id || media.id || "");
  const isFavorite = favorites.includes(mediaId);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [seasonsData, setSeasonsData] = useState<any[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);

  useEffect(() => {
    if (!isSeries || activeProfile.isDemo || !media.series_id) return;
    let isCancelled = false;
    setLoadingEpisodes(true);
    fluxaApi.series.detail(activeProfile.id, String(media.series_id))
      .then((rawInfo: any) => {
        if (isCancelled || !rawInfo) return;
        const episodesObj = rawInfo.episodes || rawInfo.seasons;
        if (!episodesObj) return;
        const seasonsList = Object.keys(episodesObj).map((sNum) => ({
          seasonNum: Number(sNum),
          episodes: episodesObj[sNum] || [],
        })).sort((a, b) => a.seasonNum - b.seasonNum);
        setSeasonsData(seasonsList);
      })
      .catch((err: any) => console.error("Error loading series info:", err))
      .finally(() => {
        if (!isCancelled) setLoadingEpisodes(false);
      });
    return () => { isCancelled = true; };
  }, [isSeries, activeProfile, media.series_id]);

  const rating = media.rating_5based || media.rating || "7.8";
  const year = media.year || media.releaseDate || "2024";
  const duration = media.duration || (isSeries ? "3 Saisons" : "2 h 15");
  const plot = media.plot || media.description || "Dans un univers fascinant et spectaculaire, découvrez une aventure palpitante mêlant action, suspense et émotions intenses.";
  const backdrop = media.backdrop || media.cover || media.stream_icon || "/assets/avatar-hero.jpg";

  const displayEpisodes = seasonsData.find((s) => s.seasonNum === selectedSeason)?.episodes || (
    isSeries ? [
      { id: 101, title: "Chapitre 1 : Le Réveil", episode_num: 1, info: { duration: "52 min" }, container_extension: "mp4" },
      { id: 102, title: "Chapitre 2 : La Confrontation", episode_num: 2, info: { duration: "48 min" }, container_extension: "mp4" },
      { id: 103, title: "Chapitre 3 : Les Secrets Enfouis", episode_num: 3, info: { duration: "55 min" }, container_extension: "mp4" },
      { id: 104, title: "Chapitre 4 : Le Piège", episode_num: 4, info: { duration: "50 min" }, container_extension: "mp4" },
    ] : []
  );

  return (
    <div className="media-detail-view" role="dialog" aria-modal="true">
      <div
        className="detail-backdrop"
        style={{ backgroundImage: `url('${backdrop}')` }}
      />
      <div className="detail-top-bar">
        <button className="detail-back-btn" onClick={onClose}>
          <ArrowLeft size={18} />
          <span>Retour</span>
        </button>
      </div>

      <div className="detail-content-box">
        <h1 className="detail-title">{media.name || media.title}</h1>
        <div className="detail-meta-row">
          <span className="nyx-card-rating" style={{ position: "static" }}>★ {rating}</span>
          <span className="detail-genres">{year}</span>
          <span className="detail-genres">·</span>
          <span className="detail-genres">{duration}</span>
          <span className="detail-genres">·</span>
          <span className="badge-quality">PG-13</span>
          <span className="badge-quality">4K Ultra HD</span>
          <span className="badge-quality">Dolby Atmos</span>
        </div>

        <div className="detail-actions">
          <button className="btn-pill-resume" onClick={() => onPlay(media)}>
            <Play size={16} fill="currentColor" /> Lecture
          </button>
          <button
            className={`btn-pill-details ${isFavorite ? "active" : ""}`}
            onClick={() => toggleFavorite(mediaId)}
          >
            {isFavorite ? <Check size={16} /> : <Plus size={16} />}
            <span>{isFavorite ? "Dans ma liste" : "Ma liste"}</span>
          </button>
          <button className="btn-pill-details">
            <Star size={16} />
            <span>Noter</span>
          </button>
        </div>

        <p className="detail-plot">{plot}</p>

        <div className="detail-cast">
          <strong>Distribution :</strong> {media.cast || "Sam Worthington, Zoe Saldana, Sigourney Weaver, Stephen Lang"}
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 8 }}>Bande-annonce & extraits</div>
          <div className="detail-trailer-card" onClick={() => onPlay(media)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={media.stream_icon || media.cover || backdrop} alt="Bande annonce" />
            <div className="cw-card-play-center" style={{ width: 36, height: 36 }}>
              <Play size={16} fill="currentColor" />
            </div>
            <span>Bande-annonce (2:15)</span>
          </div>
        </div>

        {/* Series Episodes Section */}
        {isSeries && (
          <div style={{ marginTop: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: "#fff", margin: 0 }}>Épisodes</h3>
              <div style={{ display: "flex", gap: 6 }}>
                {(seasonsData.length > 0 ? seasonsData : [{ seasonNum: 1 }, { seasonNum: 2 }]).map((s) => (
                  <button
                    key={s.seasonNum}
                    className={`quick-filter-btn ${selectedSeason === s.seasonNum ? "active" : ""}`}
                    onClick={() => setSelectedSeason(s.seasonNum)}
                  >
                    Saison {s.seasonNum}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
              {displayEpisodes.map((ep: any, idx: number) => (
                <div
                  key={ep.id || idx}
                  className="cw-card"
                  style={{ aspectRatio: "16 / 9", flex: "none" }}
                  onClick={() => onPlay({ ...media, episode: ep, seasonNum: selectedSeason })}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ep.info?.movie_image || media.cover || backdrop} alt={ep.title} />
                  <div className="cw-card-play-center" style={{ width: 38, height: 38 }}>
                    <Play size={16} fill="currentColor" />
                  </div>
                  <div className="cw-card-ep-badge">E{ep.episode_num || idx + 1}</div>
                  <div className="cw-card-title">{ep.title || `Épisode ${idx + 1}`}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Similar Titles if Movie */}
        {!isSeries && (
          <div style={{ marginTop: 36, paddingBottom: 60 }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 14 }}>Titres similaires</h3>
            <div className="nyx-scroll-row" style={{ padding: "0 0 16px" }}>
              {(allMovies && allMovies.length > 0
                ? allMovies.filter((m) => String(m.stream_id) !== mediaId).slice(0, 8).map((m) => ({
                    title: m.name.replace(/\b(19\d\d|20\d\d)\b/g, "").replace(/[()[\]]/g, "").trim() || m.name,
                    cover: m.stream_icon || "/assets/avatar_card.jpg",
                    rating: m.rating_5based ? String(m.rating_5based) : "8.0",
                    raw: m,
                  }))
                : [
                    { title: "Project Hail Mary", cover: "/assets/hailmary.jpg", rating: "8.1", raw: null },
                    { title: "Crime 101", cover: "/assets/crime101.jpg", rating: "7.4", raw: null },
                    { title: "Dune : Deuxième Partie", cover: "/assets/dune.jpg", rating: "8.6", raw: null },
                    { title: "Super Mario Bros", cover: "/assets/mario_card.jpg", rating: "7.1", raw: null },
                    { title: "The GOAT", cover: "/assets/goat.jpg", rating: "7.3", raw: null },
                  ]
              ).map((sim, i) => (
                <div
                  key={i}
                  className="nyx-card"
                  onClick={() => {
                    if (sim.raw) {
                      onPlay(sim.raw);
                    } else {
                      onPlay({ ...media, name: sim.title, stream_icon: sim.cover, cover: sim.cover });
                    }
                  }}
                >
                  <div className="nyx-card-accent-line" style={{ background: "linear-gradient(90deg, #f4384f, #ff6b81)" }} />
                  <span className="nyx-card-rating">★ {sim.rating}</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={sim.cover} alt={sim.title} />
                  <div className="nyx-card-title-overlay">{sim.title}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ==========================================================================
   CINEMA PLAYER MODAL (Full Viewport Player with Drawers)
   ========================================================================== */
function CinemaPlayerModal({
  playerState,
  onClose,
  activeProfile,
  allChannels = [],
  allSeriesEpisodes = [],
  onSelectChannel,
  onSelectEpisode,
  favoriteChannelIds = [],
  toggleFavoriteChannel,
  onPlaybackSuccess,
  onPlaybackError,
}: {
  playerState: {
    type: "live" | "movie" | "series";
    title: string;
    videoUrl: string;
    streamId?: string | number;
    channel?: LiveStream;
    movie?: VodMovie;
    series?: SeriesItem;
    seasonNum?: string | number;
    episode?: any;
  };
  onClose: () => void;
  activeProfile: ActiveProfile;
  allChannels?: LiveStream[];
  allSeriesEpisodes?: any[];
  onSelectChannel?: (channel: LiveStream) => void;
  onSelectEpisode?: (series: SeriesItem, episode: any, seasonNum: string | number) => void;
  favoriteChannelIds?: string[];
  toggleFavoriteChannel?: (stream: LiveStream) => void;
  onPlaybackSuccess?: () => void;
  onPlaybackError?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState<"channels" | "episodes" | null>(null);
  const [selectedDrawerCat, setSelectedDrawerCat] = useState("all");
  const [drawerSearch, setDrawerSearch] = useState("");
  const hideControlsTimer = useRef<NodeJS.Timeout | null>(null);

  const handleMouseMove = useCallback(() => {
    setControlsVisible(true);
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    hideControlsTimer.current = setTimeout(() => {
      if (!drawerOpen) setControlsVisible(false);
    }, 3500);
  }, [drawerOpen]);

  useEffect(() => {
    return () => {
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    };
  }, []);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
      setDuration(videoRef.current.duration || 0);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const next = !isMuted;
    setIsMuted(next);
    videoRef.current.muted = next;
  };

  const cyclePlaybackRate = () => {
    if (!videoRef.current) return;
    const rates = [1, 1.25, 1.5, 2];
    const nextRate = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
    setPlaybackRate(nextRate);
    videoRef.current.playbackRate = nextRate;
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return "00:00";
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h > 0) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const vlcUrl = `vlc://${playerState.videoUrl}`;

  const drawerChannels = useMemo(() => {
    let list = allChannels;
    if (selectedDrawerCat !== "all") {
      list = list.filter((ch) => ch.category_id === selectedDrawerCat);
    }
    if (drawerSearch.trim()) {
      const q = drawerSearch.toLowerCase();
      list = list.filter((ch) => ch.name.toLowerCase().includes(q));
    }
    return list;
  }, [allChannels, selectedDrawerCat, drawerSearch]);

  return (
    <div
      className="cinema-player-modal"
      onMouseMove={handleMouseMove}
      onClick={() => setDrawerOpen(null)}
    >
      <div className="cinema-video-wrap">
        {playerState.type === "live" ? (
          <LivePlayer
            url={playerState.videoUrl}
            channelName={playerState.title}
            streamId={playerState.streamId || 0}
            hasTimeshiftArchive={true}
            onPlaybackSuccess={onPlaybackSuccess}
            onPlaybackError={onPlaybackError}
          />
        ) : (
          <video
            ref={videoRef}
            src={playerState.videoUrl}
            autoPlay
            playsInline
            onTimeUpdate={handleTimeUpdate}
            onEnded={() => setIsPlaying(false)}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onClick={(e) => {
              e.stopPropagation();
              togglePlay();
            }}
          />
        )}
      </div>

      {/* Top bar */}
      <div className={`cinema-topbar ${controlsVisible ? "visible" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="cinema-topbar-left">
          <div className="cinema-topbar-lock">
            <span>🔒</span>
            <span className="cinema-topbar-title">{playerState.title}</span>
          </div>
          <span className="cinema-topbar-quality">4K HDR</span>
        </div>
        <button className="cinema-close-btn" onClick={onClose} title="Fermer">
          <X size={20} />
        </button>
      </div>

      {/* Bottom bar (Full controls for all playback types) */}
      {(
        <div
          className={`cinema-bottom-bar ${controlsVisible ? "visible" : ""}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="cinema-timeline-wrap">
            <input
              type="range"
              className="cinema-timeline-range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              style={{
                background: `linear-gradient(to right, #f4384f 0%, #f4384f ${progressPercent}%, rgba(255,255,255,0.2) ${progressPercent}%, rgba(255,255,255,0.2) 100%)`,
              }}
            />
          </div>

          <div className="cinema-controls-row">
            <div className="cinema-controls-left">
              <button className="cinema-btn-icon" onClick={togglePlay}>
                {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
              </button>
              <div className="cinema-time-display">
                <span>{formatTime(currentTime)}</span>
                <span style={{ opacity: 0.5 }}>/</span>
                <span>{formatTime(duration)}</span>
              </div>
              <div className="cinema-volume-wrap">
                <button className="cinema-btn-icon" onClick={toggleMute}>
                  {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
                <input
                  type="range"
                  className="cinema-vol-range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                />
              </div>
            </div>

            <div className="cinema-controls-center">
              {playerState.type === "live" ? (
                <button
                  className="cinema-pill-toggle"
                  onClick={() => setDrawerOpen((prev) => (prev === "channels" ? null : "channels"))}
                >
                  <Tv size={16} />
                  <span>TV Channels</span>
                </button>
              ) : playerState.type === "series" ? (
                <button
                  className="cinema-pill-toggle"
                  onClick={() => setDrawerOpen((prev) => (prev === "episodes" ? null : "episodes"))}
                >
                  <ListVideo size={16} />
                  <span>Episodes</span>
                </button>
              ) : null}
            </div>

            <div className="cinema-controls-right">
              <button className="cinema-btn-text" onClick={cyclePlaybackRate} title="Vitesse de lecture">
                {playbackRate}x
              </button>
              <a
                href={vlcUrl}
                className="cinema-btn-vlc"
                title="Ouvrir le flux dans le lecteur externe VLC"
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={14} />
                <span>VLC</span>
              </a>
              <button
                className="cinema-btn-icon"
                onClick={() => {
                  if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen?.();
                  } else {
                    document.exitFullscreen?.();
                  }
                }}
                title="Plein écran"
              >
                <Maximize2 size={17} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live TV Channels Drawer (From Left - Matching Screenshot 5) */}
      {playerState.type === "live" && drawerOpen === "channels" && (
        <div className="cinema-channels-drawer" onClick={(e) => e.stopPropagation()}>
          {/* Left Categories List */}
          <div className="drawer-left-cats">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>Channels</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: "#64748b", background: "rgba(255,255,255,0.08)", padding: "2px 6px", borderRadius: 4 }}>
                {allChannels.length > 0 ? allChannels.length : 39468}
              </span>
            </div>
            <div style={{ fontSize: 11, fontWeight: 650, color: "#f4384f", display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", borderRadius: 6, background: "rgba(244,56,79,0.12)", cursor: "pointer" }}>
              <Heart size={12} fill="#f4384f" /> Favorites
            </div>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", textTransform: "uppercase", marginTop: 12, marginBottom: 4 }}>PINNED</div>
            {["[FR] ● TNT HEVC", "[FR] ● TNT SD", "[FR] ● EUROSPORT"].map((cat, idx) => (
              <div key={idx} style={{ fontSize: 11, color: "#cbd5e1", padding: "5px 8px", borderRadius: 4, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>{cat}</span>
                <Pin size={10} color="#f4384f" fill="#f4384f" />
              </div>
            ))}
            <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", textTransform: "uppercase", marginTop: 12, marginBottom: 4 }}>ALL</div>
            {["[PPV] ● ALL PPV EVENT", "[4K] ● UHD 3840P", "[FR] ● TOUTE LES CHAINES", "[FR] ● TNT HD", "[FR] ● MY TF1+"].map((cat, idx) => (
              <div key={idx} style={{ fontSize: 11, color: idx === 3 ? "#fff" : "#94a3b8", padding: "5px 8px", borderRadius: 4, cursor: "pointer", background: idx === 3 ? "rgba(255,255,255,0.08)" : undefined }}>
                {cat}
              </div>
            ))}
          </div>

          {/* Right 2-Column Channel Grid */}
          <div className="drawer-right-grid">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>FR| TNT HD</span>
              <button className="cinema-close-btn" style={{ width: 28, height: 28 }} onClick={() => setDrawerOpen(null)}>
                <X size={15} />
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, overflowY: "auto", flex: 1, paddingRight: 4 }}>
              {[
                { name: "FR| TF1", logo: "/assets/tf1.png", isFav: true },
                { name: "FR| CANAL+", logo: "/assets/canal.png", isFav: false },
                { name: "FR| FRANCE 2", logo: "/assets/france2.png", isFav: false },
                { name: "FR| M6", logo: "/assets/m6.png", isFav: false },
                { name: "FR| BEIN SPORTS 1", logo: "/assets/bein.png", isFav: false },
                { name: "FR| RMC SPORT 1", logo: "/assets/rmc.png", isFav: false },
                { name: "FR| ARTE", logo: "/assets/arte.png", isFav: false },
                { name: "FR| FRANCE 3", logo: "/assets/france3.png", isFav: false },
              ].map((ch, idx) => (
                <div
                  key={idx}
                  className={`drawer-channel-tile ${playerState.title === ch.name ? "active" : ""}`}
                  onClick={() => {
                    setDrawerOpen(null);
                  }}
                >
                  <img src={ch.logo} alt={ch.name} />
                  <span>{ch.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Series Episodes Drawer (From Right) */}
      {playerState.type === "series" && drawerOpen === "episodes" && (
        <div className="cinema-episodes-drawer" onClick={(e) => e.stopPropagation()}>
          <div className="drawer-header">
            <span className="drawer-series-title">{playerState.series?.name || "Épisodes"}</span>
            <button className="cinema-close-btn" onClick={() => setDrawerOpen(null)}>
              <X size={18} />
            </button>
          </div>
          <div className="drawer-episodes-list">
            {(allSeriesEpisodes.length > 0
              ? allSeriesEpisodes
              : [
                  { id: 1, episode_num: 1, title: "Épisode 1", duration: "52 min" },
                  { id: 2, episode_num: 2, title: "Épisode 2", duration: "48 min" },
                  { id: 3, episode_num: 3, title: "Épisode 3", duration: "55 min" },
                  { id: 4, episode_num: 4, title: "Épisode 4", duration: "50 min" },
                  { id: 5, episode_num: 5, title: "Épisode 5", duration: "54 min" },
                ]
            ).map((ep: any, idx: number) => {
              const isActive = playerState.episode?.id === ep.id || playerState.episode?.episode_num === ep.episode_num;
              return (
                <div
                  key={ep.id || idx}
                  className="drawer-episode-item"
                  style={{
                    borderColor: isActive ? "#f4384f" : "transparent",
                    background: isActive ? "rgba(244, 56, 79, 0.15)" : undefined,
                  }}
                  onClick={() => {
                    if (playerState.series) {
                      onSelectEpisode?.(playerState.series, ep, playerState.seasonNum || 1);
                    }
                    setDrawerOpen(null);
                  }}
                >
                  <div style={{ width: 80, aspectRatio: "16 / 9", borderRadius: 6, overflow: "hidden", background: "#1b1d28", flexShrink: 0 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={ep.info?.movie_image || playerState.series?.cover || "/assets/avatar_card.jpg"}
                      alt={ep.title}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      E{ep.episode_num || idx + 1} - {ep.title || `Épisode ${idx + 1}`}
                    </span>
                    <span style={{ fontSize: 11, color: "#94a3b8" }}>{ep.info?.duration || ep.duration || "45 min"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function HomeView({
  activeProfile,
  changeView,
  liveStreams,
  vodMovies,
  seriesList = [],
  historyItems = [],
  onSelectStream,
  onPlayMovie,
  onSelectHomeChannel,
  onSelectHomeMovie,
  onSelectHomeSeries,
  onOpenSeriesDetail,
  onOpenDetail,
  onStartCinema,
  favorites,
  toggleFavorite,
}: {
  activeProfile: ActiveProfile;
  changeView: (view: View) => void;
  liveStreams: LiveStream[];
  vodMovies: VodMovie[];
  seriesList?: SeriesItem[];
  historyItems?: HistoryItem[];
  onSelectStream: (stream: LiveStream) => void;
  onPlayMovie: (movie: VodMovie) => void;
  onSelectHomeChannel: (tag: string, preferredStreamId?: number, categoryId?: string) => void;
  onSelectHomeMovie: (query: string, preferredStreamId?: number, fallbackMovie?: any) => void;
  onSelectHomeSeries: (query: string, preferredSeriesId?: number, fallbackSeries?: any) => void;
  onOpenSeriesDetail?: (series: SeriesItem) => void;
  onOpenDetail?: (media: any) => void;
  onStartCinema?: (state: any) => void;
  favorites: string[];
  toggleFavorite: (id: string) => void;
}) {
  const [heroIndex, setHeroIndex] = useState(0);
  const [carouselPaused, setCarouselPaused] = useState(false);

  // 1. Slides Hero calculées dynamiquement depuis le vrai catalogue IPTV
  const heroSlides = useMemo(() => {
    const slides: Array<{
      id: string;
      title: string;
      eyebrow: string;
      year: string;
      duration: string;
      rating: string;
      genre: string;
      badge: string;
      image: string;
      poster: string;
      description: string;
      cast?: string;
      streamId?: number | string;
      kind: "movie" | "series";
      rawMovie?: VodMovie;
      rawSeries?: SeriesItem;
      videoUrl?: string;
    }> = [];

    // Ajouter les meilleurs films réels disponibles
    if (vodMovies && vodMovies.length > 0) {
      const candidates = vodMovies
        .filter((m) => Boolean(m.name && m.stream_icon))
        .slice(0, 3);

      candidates.forEach((m) => {
        const yearMatch = m.name.match(/\b(19\d\d|20\d\d)\b/);
        const year = yearMatch ? yearMatch[1] : "2024";
        const cleanTitle = m.name.replace(/\b(19\d\d|20\d\d)\b/g, "").replace(/[()[\]]/g, "").trim();
        const rating = m.rating_5based ? String(m.rating_5based) : (m.rating ? String(m.rating) : "8.2");

        slides.push({
          id: `movie_${m.stream_id}`,
          title: cleanTitle || m.name,
          eyebrow: "SÉLECTION CINÉMA",
          year,
          duration: m.container_extension ? `${m.container_extension.toUpperCase()} · 4K` : "4K UHD",
          rating,
          genre: (m as any).category_name || "Film VOD · 4K",
          badge: "4K UHD · Dolby Atmos",
          image: m.stream_icon,
          poster: m.stream_icon,
          description: (m as any).plot || (m as any).description || `Regardez ${cleanTitle || m.name} en très haute définition sur Fluxa TV.`,
          cast: (m as any).cast || "Distribution officielle",
          streamId: m.stream_id,
          kind: "movie",
          rawMovie: m,
        });
      });
    }

    // Ajouter les meilleures séries réelles disponibles
    if (seriesList && seriesList.length > 0) {
      const candidates = seriesList
        .filter((s) => Boolean(s.name && (s.cover || (s as any).stream_icon)))
        .slice(0, 2);

      candidates.forEach((s) => {
        const yearMatch = s.name.match(/\b(19\d\d|20\d\d)\b/);
        const year = yearMatch ? yearMatch[1] : (s.releaseDate ? s.releaseDate.slice(0, 4) : "2024");
        const cleanTitle = s.name.replace(/\b(19\d\d|20\d\d)\b/g, "").replace(/[()[\]]/g, "").trim();
        const rating = s.rating ? String(s.rating) : "8.6";

        slides.push({
          id: `series_${s.series_id}`,
          title: cleanTitle || s.name,
          eyebrow: "SÉRIE ÉVÉNEMENT",
          year,
          duration: "Série TV",
          rating,
          genre: s.genre || (s as any).category_name || "Série TV · Épisodes complets",
          badge: "HDR · Saisons complètes",
          image: s.cover || (s as any).stream_icon || "/assets/invincible-hero.jpg",
          poster: s.cover || (s as any).stream_icon || "/assets/invincible_card.jpg",
          description: s.plot || `Toutes les saisons et épisodes de ${cleanTitle || s.name} en streaming instantané.`,
          cast: s.cast || "Distribution originale",
          streamId: s.series_id,
          kind: "series",
          rawSeries: s,
        });
      });
    }

    // Fallback Démo 100% fonctionnel et jouable si catalogue vide ou mode démo
    if (slides.length === 0) {
      return [
        {
          id: "demo_avatar_2",
          title: "Avatar : La Voie de l'eau",
          eyebrow: "SÉLECTION CINÉMA",
          year: "2022",
          duration: "3 h 12",
          rating: "7.8",
          genre: "Science-fiction · Aventure",
          badge: "4K UHD · Dolby Atmos",
          image: "/assets/avatar-hero.jpg",
          poster: "/assets/avatar_card.jpg",
          description: "Jake Sully vit avec sa nouvelle famille sur la planète Pandora. Lorsqu'une menace familière revient, Jake doit travailler avec Neytiri et l'armée des Na'vi pour protéger leur foyer.",
          cast: "Sam Worthington, Zoe Saldana, Sigourney Weaver, Stephen Lang",
          streamId: 99101,
          kind: "movie" as const,
          videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
        },
        {
          id: "demo_mario_movie",
          title: "Super Mario Bros. Le Film",
          eyebrow: "ANIMATION ÉVÉNEMENT",
          year: "2023",
          duration: "1 h 32",
          rating: "7.1",
          genre: "Animation · Comédie",
          badge: "4K UHD · HDR",
          image: "/assets/mario-hero.jpg",
          poster: "/assets/mario_card.jpg",
          description: "Un plombier nommé Mario parcourt un labyrinthe souterrain avec son frère Luigi, tentant de sauver une princesse capturée du redoutable Bowser.",
          cast: "Chris Pratt, Anya Taylor-Joy, Charlie Day, Jack Black",
          streamId: 99102,
          kind: "movie" as const,
          videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
        },
        {
          id: "demo_invincible_series",
          title: "Invincible",
          eyebrow: "SÉRIE ÉVÉNEMENT",
          year: "2021",
          duration: "3 Saisons",
          rating: "8.7",
          genre: "Animation · Action · Drame",
          badge: "HDR · 18+",
          image: "/assets/invincible-hero.jpg",
          poster: "/assets/invincible_card.jpg",
          description: "Mark Grayson hérite des super-pouvoirs de son père et commence son entraînement, découvrant que l'héritage d'Omni-Man n'est peut-être pas aussi héroïque qu'il n'y paraît.",
          cast: "Steven Yeun, J.K. Simmons, Sandra Oh, Zazie Beetz",
          kind: "series" as const,
          streamId: 30062,
          videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
        },
        {
          id: "demo_dune_part_two",
          title: "Dune : Deuxième Partie",
          eyebrow: "BLOCKBUSTER SCI-FI",
          year: "2024",
          duration: "2 h 46",
          rating: "8.6",
          genre: "Science-fiction · Drame",
          badge: "4K Dolby Atmos",
          image: "/assets/dune.jpg",
          poster: "/assets/dune.jpg",
          description: "Paul Atréides s'unit à Chani et aux Fremen pour mener la révolte contre les conspirateurs qui ont anéanti sa famille.",
          cast: "Timothée Chalamet, Zendaya, Rebecca Ferguson, Javier Bardem",
          streamId: 1516225,
          kind: "movie" as const,
          videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
        },
        {
          id: "demo_oppenheimer",
          title: "Oppenheimer",
          eyebrow: "CHEF-D'ŒUVRE",
          year: "2023",
          duration: "3 h 00",
          rating: "8.9",
          genre: "Drame · Historique",
          badge: "4K UHD · IMAX",
          image: "/assets/opp.jpg",
          poster: "/assets/opp.jpg",
          description: "Le destin du brillant physicien J. Robert Oppenheimer, au cœur du projet Manhattan qui bouleversa le cours de l'histoire du monde.",
          cast: "Cillian Murphy, Emily Blunt, Matt Damon, Robert Downey Jr.",
          streamId: 634022,
          kind: "movie" as const,
          videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
        },
      ];
    }

    return slides;
  }, [vodMovies, seriesList]);

  const currentSlide = heroSlides[heroIndex] || heroSlides[0];

  useEffect(() => {
    if (carouselPaused) return;
    const timer = setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % heroSlides.length);
    }, 7000);
    return () => clearInterval(timer);
  }, [carouselPaused, heroSlides.length]);

  const handlePlayCurrent = () => {
    if (currentSlide.rawMovie) {
      if (onStartCinema) {
        onStartCinema({
          type: "movie",
          title: currentSlide.title,
          videoUrl: activeProfile.isDemo
            ? "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4"
            : fluxaApi.streamUrl(activeProfile.id, "movie", currentSlide.rawMovie.stream_id, currentSlide.rawMovie.container_extension || "mp4"),
          streamId: currentSlide.rawMovie.stream_id,
          movie: currentSlide.rawMovie,
        });
      } else {
        onPlayMovie(currentSlide.rawMovie);
      }
      return;
    }

    if (currentSlide.rawSeries) {
      if (onOpenSeriesDetail) {
        onOpenSeriesDetail(currentSlide.rawSeries);
      } else if (onOpenDetail) {
        onOpenDetail(currentSlide.rawSeries);
      }
      return;
    }

    // Fallback Démo
    if (onStartCinema) {
      onStartCinema({
        type: currentSlide.kind === "series" ? "series" : "movie",
        title: currentSlide.title,
        videoUrl: currentSlide.videoUrl || "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
        streamId: currentSlide.streamId || 101,
      });
    }
  };

  const handleOpenDetailCurrent = () => {
    if (currentSlide.rawMovie && onOpenDetail) {
      onOpenDetail(currentSlide.rawMovie);
    } else if (currentSlide.rawSeries) {
      if (onOpenSeriesDetail) onOpenSeriesDetail(currentSlide.rawSeries);
      else if (onOpenDetail) onOpenDetail(currentSlide.rawSeries);
    } else if (onOpenDetail) {
      onOpenDetail({
        ...currentSlide,
        name: currentSlide.title,
        stream_icon: currentSlide.poster,
        cover: currentSlide.poster,
        backdrop: currentSlide.image,
      });
    }
  };

  const isCurrentFav = favorites.includes(currentSlide.id);

  // 2. Tendances actuelles (Vrais films ou démo jouable)
  type HomeMediaCard = {
    id: string;
    title: string;
    rating: string;
    cover: string;
    rawMovie?: VodMovie;
    videoUrl?: string;
  };

  const handleQuickPlayMovie = (e: React.MouseEvent, item: HomeMediaCard) => {
    e.stopPropagation();
    if (item.rawMovie && onStartCinema) {
      onStartCinema({
        type: "movie",
        title: item.title,
        videoUrl: activeProfile.isDemo
          ? ((item as any).videoUrl || "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4")
          : fluxaApi.streamUrl(activeProfile.id, "movie", item.rawMovie.stream_id, item.rawMovie.container_extension || "mp4"),
        streamId: item.rawMovie.stream_id,
        movie: item.rawMovie,
      });
    } else if (item.rawMovie) {
      onPlayMovie(item.rawMovie);
    } else if (onStartCinema) {
      onStartCinema({
        type: "movie",
        title: item.title,
        videoUrl: (item as any).videoUrl || "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
        streamId: 99100,
      });
    }
  };

  const trendingItems: HomeMediaCard[] = useMemo(() => {
    if (vodMovies && vodMovies.length > 0) {
      return vodMovies.slice(0, 14).map((m) => ({
        id: `tr_movie_${m.stream_id}`,
        title: m.name.replace(/\b(19\d\d|20\d\d)\b/g, "").replace(/[()[\]]/g, "").trim() || m.name,
        rating: m.rating_5based ? String(m.rating_5based) : (m.rating ? String(m.rating) : "7.8"),
        cover: m.stream_icon || "/assets/avatar_card.jpg",
        rawMovie: m,
      }));
    }

    return [
      { id: "tr_1", title: "Avatar : La Voie de l'eau", rating: "7.8", cover: "/assets/avatar_card.jpg", videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4" },
      { id: "tr_2", title: "Crime 101", rating: "7.4", cover: "/assets/crime101.jpg", videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4" },
      { id: "tr_3", title: "Project Hail Mary", rating: "8.1", cover: "/assets/hailmary.jpg", videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4" },
      { id: "tr_4", title: "Super Mario Bros", rating: "7.1", cover: "/assets/mario_card.jpg", videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4" },
      { id: "tr_5", title: "Scream 7", rating: "6.8", cover: "/assets/scream7.jpg", videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4" },
      { id: "tr_6", title: "Daredevil: Born Again", rating: "8.5", cover: "/assets/daredevil.jpg", videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4" },
      { id: "tr_7", title: "Invincible", rating: "8.7", cover: "/assets/invincible_card.jpg", videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4" },
      { id: "tr_8", title: "The GOAT", rating: "7.3", cover: "/assets/goat.jpg", videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4" },
    ];
  }, [vodMovies]);

  // 3. Reprendre la lecture (Historique réel ou suggestions de séries réelles)
  type HomeContinueWatchingCard = {
    id: string;
    title: string;
    ep: string;
    progress: number;
    cover: string;
    rawHistory?: HistoryItem;
    rawSeries?: SeriesItem;
    rawMovie?: VodMovie;
    videoUrl?: string;
  };

  const continueWatchingItems: HomeContinueWatchingCard[] = useMemo(() => {
    // A. Si historique réel présent
    if (historyItems && historyItems.length > 0) {
      return historyItems.slice(0, 10).map((h) => ({
        id: h.id,
        title: h.title,
        ep: h.badge || (h.category === "movies" ? "FILM" : h.category === "series" ? "SÉRIE" : "DIRECT"),
        progress: h.progress || 45,
        cover: h.poster || h.logo || "/assets/avatar_card.jpg",
        rawHistory: h,
      }));
    }

    // B. Si aucun historique mais séries réelles présentes
    if (seriesList && seriesList.length > 0) {
      return seriesList.slice(0, 8).map((s, idx) => ({
        id: `cw_series_${s.series_id}`,
        title: s.name.replace(/\b(19\d\d|20\d\d)\b/g, "").replace(/[()[\]]/g, "").trim() || s.name,
        ep: "S1 · E1",
        progress: [65, 40, 85, 30, 70, 50, 90, 45][idx % 8],
        cover: s.cover || (s as any).stream_icon || "/assets/invincible_card.jpg",
        rawSeries: s,
      }));
    }

    // C. Mode démo
    return [
      { id: "cw_1", title: "Invincible", ep: "S1E6", progress: 65, cover: "/assets/cw_invincible.jpg", videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4" },
      { id: "cw_2", title: "Peaky Blinders", ep: "S6E1", progress: 40, cover: "/assets/cw_peaky.jpg", videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4" },
      { id: "cw_3", title: "Project Hail Mary", ep: "S1E1", progress: 85, cover: "/assets/cw_hailmary.jpg", videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4" },
      { id: "cw_4", title: "You", ep: "S4E3", progress: 30, cover: "/assets/cw_you.jpg", videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4" },
      { id: "cw_5", title: "The Flash", ep: "S9E1", progress: 70, cover: "/assets/cw_flash.jpg", videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4" },
      { id: "cw_6", title: "Frieren", ep: "E12", progress: 50, cover: "/assets/cw_frieren.jpg", videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4" },
      { id: "cw_7", title: "One Piece", ep: "S1E10", progress: 90, cover: "/assets/cw_onepiece.jpg", videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4" },
    ];
  }, [historyItems, seriesList]);

  // 4. Films récents (Vrais films ou démo)
  const recentMoviesList: HomeMediaCard[] = useMemo(() => {
    if (vodMovies && vodMovies.length > 14) {
      return vodMovies.slice(14, 28).map((m) => ({
        id: `rm_movie_${m.stream_id}`,
        title: m.name.replace(/\b(19\d\d|20\d\d)\b/g, "").replace(/[()[\]]/g, "").trim() || m.name,
        rating: m.rating_5based ? String(m.rating_5based) : (m.rating ? String(m.rating) : "7.7"),
        cover: m.stream_icon || "/assets/avatar_card.jpg",
        rawMovie: m,
      }));
    }

    if (vodMovies && vodMovies.length > 0) {
      return vodMovies.slice(0, 14).map((m) => ({
        id: `rm_movie_${m.stream_id}`,
        title: m.name.replace(/\b(19\d\d|20\d\d)\b/g, "").replace(/[()[\]]/g, "").trim() || m.name,
        rating: m.rating_5based ? String(m.rating_5based) : (m.rating ? String(m.rating) : "7.7"),
        cover: m.stream_icon || "/assets/avatar_card.jpg",
        rawMovie: m,
      }));
    }

    return [
      { id: "m_1", title: "One Piece Red", rating: "7.9", cover: "/assets/cw_op_anime.jpg", videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4" },
      { id: "m_2", title: "Interstellar", rating: "8.7", cover: "/assets/inter.jpg", videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4" },
      { id: "m_3", title: "Gladiator II", rating: "7.7", cover: "/assets/glad.jpg", videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4" },
      { id: "m_4", title: "The Batman", rating: "7.9", cover: "/assets/batman.jpg", videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4" },
      { id: "m_5", title: "John Wick: Chapter 4", rating: "8.2", cover: "/assets/john.jpg", videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4" },
      { id: "m_6", title: "Spider-Man", rating: "8.3", cover: "/assets/spider.jpg", videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4" },
    ];
  }, [vodMovies]);

  // 5. Chaînes TV populaires (Vraies chaînes de la catégorie chargée ou démo)
  type HomeChannelCard = {
    id: string;
    name: string;
    logo: string;
    rawStream?: LiveStream;
    tag?: string;
    streamId?: number;
    catId?: string;
  };

  const popularChannelsList: HomeChannelCard[] = useMemo(() => {
    if (liveStreams && liveStreams.length > 0) {
      const popularNames = ["TF1", "CANAL", "FRANCE 2", "FRANCE 3", "M6", "BEIN", "RMC", "ARTE", "EUROSPORT"];
      const matched: LiveStream[] = [];
      const others: LiveStream[] = [];

      liveStreams.forEach((st) => {
        const upper = st.name.toUpperCase();
        if (popularNames.some((p) => upper.includes(p))) {
          matched.push(st);
        } else {
          others.push(st);
        }
      });

      const chosen = [...matched, ...others].slice(0, 12);
      return chosen.map((st) => ({
        id: `ch_${st.stream_id}`,
        name: st.name.replace(/^[A-Z]{2,3}\s*[|:]\s*/i, "").trim() || st.name,
        logo: st.stream_icon || "/assets/tf1.png",
        rawStream: st,
      }));
    }

    return [
      { id: "ch_demo_1", name: "TF1", logo: "/assets/tf1.png", tag: "TF1", streamId: 220807, catId: "159" },
      { id: "ch_demo_2", name: "Canal+", logo: "/assets/canal.png", tag: "CANAL+", streamId: 220815, catId: "159" },
      { id: "ch_demo_3", name: "France 2", logo: "/assets/france2.png", tag: "FRANCE 2", streamId: 220808, catId: "159" },
      { id: "ch_demo_4", name: "beIN Sports 1", logo: "/assets/bein.png", tag: "BEIN 1", streamId: 220820, catId: "68" },
      { id: "ch_demo_5", name: "RMC Sport 1", logo: "/assets/rmc.png", tag: "RMC 1", streamId: 220825, catId: "68" },
      { id: "ch_demo_6", name: "M6", logo: "/assets/m6.png", tag: "M6", streamId: 220810, catId: "159" },
      { id: "ch_demo_7", name: "France 3", logo: "/assets/france3.png", tag: "FRANCE 3", streamId: 220809, catId: "159" },
      { id: "ch_demo_8", name: "Arte", logo: "/assets/arte.png", tag: "ARTE", streamId: 220812, catId: "159" },
    ];
  }, [liveStreams]);

  return (
    <div className="view-home-nyx" style={{ paddingBottom: 60 }}>
      {/* Full-Bleed Hero Showcase */}
      <section
        className="nyx-hero"
        onMouseEnter={() => setCarouselPaused(true)}
        onMouseLeave={() => setCarouselPaused(false)}
      >
        <div className="nyx-hero-backdrops">
          {heroSlides.map((slide, index) => (
            <div
              key={slide.id}
              className={`nyx-hero-backdrop ${index === heroIndex ? "is-active" : ""}`}
              style={{ backgroundImage: `url('${slide.image}')` }}
            />
          ))}
        </div>

        <div className="nyx-hero-content">
          <span className="nyx-hero-eyebrow">{currentSlide.eyebrow}</span>
          <h1 className="nyx-hero-title">{currentSlide.title}</h1>
          <div className="nyx-hero-meta">
            <span className="nyx-card-rating" style={{ position: "static" }}>★ {currentSlide.rating}</span>
            <span>{currentSlide.year}</span>
            <span>·</span>
            <span>{currentSlide.duration}</span>
            <span>·</span>
            <span className="badge-quality">{currentSlide.badge}</span>
          </div>
          <p className="nyx-hero-desc">{currentSlide.description}</p>

          <div className="nyx-hero-actions">
            <button className="btn-pill-resume" onClick={handlePlayCurrent}>
              <Play size={16} fill="currentColor" /> Reprendre
            </button>
            <button className="btn-pill-details" onClick={handleOpenDetailCurrent}>
              <Info size={16} /> Détails
            </button>
            <button
              className={`btn-circle-add ${isCurrentFav ? "added" : ""}`}
              onClick={() => toggleFavorite(currentSlide.id)}
              title={isCurrentFav ? "Retirer de ma liste" : "Ajouter à ma liste"}
            >
              {isCurrentFav ? <Check size={18} /> : <Plus size={18} />}
            </button>
          </div>

          <div className="hero-quick-filters">
            <button className="quick-filter-btn active" onClick={() => changeView("home")}>
              <Sparkles size={13} /> Suggestions
            </button>
            <button className="quick-filter-btn" onClick={() => changeView("movies")}>
              <Film size={13} /> Films
            </button>
            <button className="quick-filter-btn" onClick={() => changeView("series")}>
              <Clapperboard size={13} /> Séries
            </button>
          </div>
        </div>

        <div className="hero-dots-nav">
          {heroSlides.map((s, idx) => (
            <button
              key={s.id}
              className={`hero-dot-item ${idx === heroIndex ? "active" : ""}`}
              onClick={() => setHeroIndex(idx)}
              aria-label={`Slide ${idx + 1}`}
            />
          ))}
        </div>
      </section>

      {/* Row 1: Tendances actuelles (Trending Now) */}
      <section className="nyx-content-section">
        <div className="nyx-section-head">
          <div className="nyx-section-title">Tendances actuelles</div>
          <button className="seeall" onClick={() => changeView("movies")}>
            Voir tout →
          </button>
        </div>
        <div className="nyx-scroll-row">
          {trendingItems.map((item, i) => (
            <div
              key={item.id || i}
              className="nyx-card"
              onClick={() => {
                if (item.rawMovie) {
                  if (onOpenDetail) onOpenDetail(item.rawMovie);
                  else onPlayMovie(item.rawMovie);
                } else if (onOpenDetail) {
                  onOpenDetail({
                    name: item.title,
                    rating: item.rating,
                    stream_icon: item.cover,
                    cover: item.cover,
                    backdrop: item.cover,
                    videoUrl: (item as any).videoUrl,
                  });
                }
              }}
            >
              <div className="nyx-card-accent-line" style={{ background: "linear-gradient(90deg, #f4384f, #ff6b81)" }} />
              <span className="nyx-card-rating">★ {item.rating}</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.cover} alt={item.title} />
              <button
                className="nyx-card-quick-play"
                title={`Regarder ${item.title}`}
                onClick={(e) => handleQuickPlayMovie(e, item)}
              >
                <Play size={18} fill="currentColor" />
              </button>
              <div className="nyx-card-title-overlay">{item.title}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Row 2: Reprendre la lecture (Continue Watching) */}
      <section className="nyx-content-section">
        <div className="nyx-section-head">
          <div className="nyx-section-title">Reprendre la lecture</div>
        </div>
        <div className="nyx-scroll-row">
          {continueWatchingItems.map((item, i) => (
            <div
              key={item.id || i}
              className="cw-card"
              onClick={() => {
                if (item.rawHistory) {
                  const h = item.rawHistory;
                  if (h.rawMovie && onStartCinema) {
                    onStartCinema({
                      type: "movie",
                      title: h.rawMovie.name,
                      videoUrl: activeProfile.isDemo
                        ? "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4"
                        : fluxaApi.streamUrl(activeProfile.id, "movie", h.rawMovie.stream_id, h.rawMovie.container_extension || "mp4"),
                      streamId: h.rawMovie.stream_id,
                      movie: h.rawMovie,
                    });
                  } else if (h.rawMovie) {
                    onPlayMovie(h.rawMovie);
                  } else if (h.rawStream) {
                    onSelectStream(h.rawStream);
                  } else if (h.category === "series" && h.stream_id) {
                    if (onStartCinema) {
                      onStartCinema({
                        type: "series",
                        title: h.title,
                        videoUrl: activeProfile.isDemo
                          ? "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4"
                          : fluxaApi.streamUrl(activeProfile.id, "series", h.stream_id, h.container_extension || "mp4"),
                        streamId: h.stream_id,
                      });
                    }
                  } else if (h.stream_id) {
                    if (onStartCinema) {
                      onStartCinema({
                        type: h.category === "movies" ? "movie" : "live",
                        title: h.title,
                        videoUrl: activeProfile.isDemo
                          ? "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4"
                          : fluxaApi.streamUrl(activeProfile.id, h.category === "movies" ? "movie" : "live", h.stream_id, h.container_extension || (h.category === "movies" ? "mp4" : "ts")),
                        streamId: h.stream_id,
                      });
                    }
                  }
                  return;
                }

                if (item.rawSeries) {
                  if (onOpenSeriesDetail) onOpenSeriesDetail(item.rawSeries);
                  else if (onOpenDetail) onOpenDetail(item.rawSeries);
                  return;
                }

                if (onStartCinema) {
                  onStartCinema({
                    type: "movie",
                    title: item.title,
                    videoUrl: (item as any).videoUrl || "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
                    streamId: 101,
                  });
                }
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.cover} alt={item.title} />
              <div className="cw-card-play-center">
                <Play size={18} fill="currentColor" />
              </div>
              <div className="cw-card-ep-badge">{item.ep}</div>
              <div className="cw-card-title">{item.title}</div>
              <div className="cw-card-progressbar">
                <div className="cw-card-progressfill" style={{ width: `${item.progress}%`, background: "#f4384f" }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Row 3: Films récents (Recent Movies) */}
      <section className="nyx-content-section">
        <div className="nyx-section-head">
          <div className="nyx-section-title">Films récents</div>
          <button className="seeall" onClick={() => changeView("movies")}>
            Voir tout →
          </button>
        </div>
        <div className="nyx-scroll-row">
          {recentMoviesList.map((item, i) => (
            <div
              key={item.id || i}
              className="nyx-card"
              onClick={() => {
                if (item.rawMovie) {
                  if (onOpenDetail) onOpenDetail(item.rawMovie);
                  else onPlayMovie(item.rawMovie);
                } else if (onOpenDetail) {
                  onOpenDetail({
                    name: item.title,
                    rating: item.rating,
                    stream_icon: item.cover,
                    cover: item.cover,
                    videoUrl: (item as any).videoUrl,
                  });
                }
              }}
            >
              <div className="nyx-card-accent-line" style={{ background: "linear-gradient(90deg, #3b82f6, #60a5fa)" }} />
              <span className="nyx-card-rating">★ {item.rating}</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.cover} alt={item.title} />
              <button
                className="nyx-card-quick-play"
                title={`Regarder ${item.title}`}
                onClick={(e) => handleQuickPlayMovie(e, item)}
              >
                <Play size={18} fill="currentColor" />
              </button>
              <div className="nyx-card-title-overlay">{item.title}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Row 4: Chaînes en direct populaires */}
      <section className="nyx-content-section">
        <div className="nyx-section-head">
          <div className="nyx-section-title">Chaînes TV populaires</div>
          <button className="seeall" onClick={() => changeView("live")}>
            Toutes les chaînes →
          </button>
        </div>
        <div className="nyx-scroll-row">
          {popularChannelsList.map((ch, idx) => (
            <div
              key={ch.id || idx}
              className="channel-card"
              style={{ flex: "0 0 160px", aspectRatio: "1.3 / 1" }}
              onClick={() => {
                if (ch.rawStream) {
                  onSelectStream(ch.rawStream);
                } else {
                  onSelectHomeChannel((ch as any).tag || ch.name, (ch as any).streamId, (ch as any).catId);
                }
              }}
            >
              <div className="channel-card-logo-box">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ch.logo} alt={ch.name} style={{ maxHeight: 52 }} />
              </div>
              <span className="channel-card-name">{ch.name}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}


function MediaCard({ item, favorite, toggleFavorite, onPlay }: { item: Media; favorite: boolean; toggleFavorite: (id: string) => void; onPlay?: (item: Media) => void }) {
  return (
    <article className="media-card">
      <div
        className="media-art"
        onClick={() => onPlay?.(item)}
        style={{ cursor: onPlay ? "pointer" : "default" }}
      >
        <MediaArtwork item={item} />
        <span className="rating">★ {item.rating}</span>
        <button
          className={`favorite-button ${favorite ? "selected" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            toggleFavorite(item.id);
          }}
          aria-label={favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
        >
          <Heart size={17} fill={favorite ? "currentColor" : "none"} />
        </button>
        <button
          className="card-play"
          aria-label={`Lire ${item.title}`}
          onClick={(e) => {
            e.stopPropagation();
            onPlay?.(item);
          }}
        >
          <Play size={21} fill="currentColor" />
        </button>
        {item.progress && (
          <span className="card-progress">
            <i style={{ width: `${item.progress}%` }} />
          </span>
        )}
      </div>
      <h3
        onClick={() => onPlay?.(item)}
        style={{ cursor: onPlay ? "pointer" : "default" }}
      >
        {item.title}
      </h3>
      <p>
        {item.episode ? `${item.episode} · ` : ""}
        {item.year} · {item.genre}
      </p>
    </article>
  );
}

const COUNTRY_FLAGS: Record<string, string> = {
  FR: "🇫🇷",
  UK: "🇬🇧",
  EN: "🇬🇧",
  US: "🇺🇸",
  USA: "🇺🇸",
  AU: "🇦🇺",
  ES: "🇪🇸",
  IT: "🇮🇹",
  DE: "🇩🇪",
  PT: "🇵🇹",
  BE: "🇧🇪",
  CH: "🇨🇭",
  AR: "🇸🇦",
  NL: "🇳🇱",
  TR: "🇹🇷",
  PL: "🇵🇱",
};

function getChannelCountry(name: string): string {
  const clean = name.trim();
  const prefixMatch = clean.match(/^([A-Za-z]{2,3})\s*[|:\-\(\[]/) || clean.match(/^\[([A-Za-z]{2,3})\]/);
  if (prefixMatch) {
    return prefixMatch[1].toUpperCase();
  }
  if (/\b(canal\+|canal|rmc|bein|tf1|m6|france\s*\d|eurosport|dazn)\b/i.test(clean)) {
    return "FR";
  }
  return "AUTRE";
}

function LiveView({
  activeProfile,
  categories: realCategories,
  selectedCategory,
  onSelectCategory,
  streams: realStreams,
  selectedStream,
  onSelectStream,
  onStartCinema,
  pinnedCategoryIds = [],
  onTogglePinCategory,
  loading,
  demoCategory,
  setDemoCategory,
  demoChannels,
  demoSelected,
  demoSelect,
  demoIsPlaying,
  demoSetIsPlaying,
  favorites,
  toggleFavorite,
  favoriteChannelIds,
  favoriteChannelsList,
  toggleFavoriteChannel,
  activeChannelIds = [],
  activeChannelsList = [],
  markChannelActive,
  markChannelsActiveBatch,
  markChannelInactive,
  showAdult = true,
}: {
  activeProfile: ActiveProfile;
  categories: LiveCategory[];
  selectedCategory: string;
  onSelectCategory: (id: string) => void;
  streams: LiveStream[];
  selectedStream: LiveStream | null;
  onSelectStream: (stream: LiveStream) => void;
  onStartCinema?: (state: any) => void;
  pinnedCategoryIds?: string[];
  onTogglePinCategory?: (catId: string) => void;
  loading: boolean;
  demoCategory: string;
  setDemoCategory: (value: string) => void;
  demoChannels: Channel[];
  demoSelected: Channel;
  demoSelect: (channel: Channel) => void;
  demoIsPlaying: boolean;
  demoSetIsPlaying: (value: boolean) => void;
  favorites: string[];
  toggleFavorite: (id: string) => void;
  favoriteChannelIds: string[];
  favoriteChannelsList: LiveStream[];
  toggleFavoriteChannel: (stream: LiveStream) => void;
  activeChannelIds?: string[];
  activeChannelsList?: LiveStream[];
  markChannelActive?: (stream: LiveStream) => void;
  markChannelsActiveBatch?: (streams: LiveStream[]) => void;
  markChannelInactive?: (streamId: string | number) => void;
  showAdult?: boolean;
}) {
  const isReal = !activeProfile.isDemo;
  const [catSearch, setCatSearch] = useState("");
  const [streamSearch, setStreamSearch] = useState("");
  const [searchScope, setSearchScope] = useState<"global" | "category">("global");
  const [globalResults, setGlobalResults] = useState<LiveStream[]>([]);
  const [searchingGlobal, setSearchingGlobal] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Demo categories matching Screenshot 4
  const demoCategoriesList: LiveCategory[] = useMemo(() => [
    { category_id: "pin_1", category_name: "[FR] ● TNT HEVC", parent_id: 0 },
    { category_id: "pin_2", category_name: "[FR] ● TNT SD", parent_id: 0 },
    { category_id: "pin_3", category_name: "[FR] ● EUROSPORT", parent_id: 0 },
    { category_id: "cat_1", category_name: "[PPV] ● ALL PPV EVENT", parent_id: 0 },
    { category_id: "cat_2", category_name: "[4K] ● UHD 3840P", parent_id: 0 },
    { category_id: "cat_3", category_name: "[FR] ● TOUTE LES CHAINES UHD/HD", parent_id: 0 },
    { category_id: "cat_4", category_name: "[FR] ● TNT HD", parent_id: 0 },
    { category_id: "cat_5", category_name: "[FR] ● MY TF1+", parent_id: 0 },
    { category_id: "cat_6", category_name: "[FR] ● INFOS", parent_id: 0 },
    { category_id: "cat_7", category_name: "[FR] ● BOX OFFICE 4K", parent_id: 0 },
    { category_id: "cat_8", category_name: "[FR] ● NETFLIX | CANALPLAY", parent_id: 0 },
    { category_id: "cat_9", category_name: "[FR] ● JEUNESSE", parent_id: 0 },
    { category_id: "cat_10", category_name: "[FR] ● DECOUVERTE", parent_id: 0 },
  ], []);

  const demoChannelsList: LiveStream[] = useMemo(() => [
    { stream_id: 101, name: "FR| TF1", stream_type: "live", stream_icon: "/assets/tf1.png", category_id: "cat_4" },
    { stream_id: 102, name: "FR| CANAL+", stream_type: "live", stream_icon: "/assets/canal.png", category_id: "cat_4" },
    { stream_id: 103, name: "FR| FRANCE 2", stream_type: "live", stream_icon: "/assets/france2.png", category_id: "cat_4" },
    { stream_id: 104, name: "FR| M6", stream_type: "live", stream_icon: "/assets/m6.png", category_id: "cat_4" },
    { stream_id: 105, name: "FR| BEIN SPORTS 1", stream_type: "live", stream_icon: "/assets/bein.png", category_id: "cat_4" },
    { stream_id: 106, name: "FR| RMC SPORT 1", stream_type: "live", stream_icon: "/assets/rmc.png", category_id: "cat_4" },
    { stream_id: 107, name: "FR| ARTE", stream_type: "live", stream_icon: "/assets/arte.png", category_id: "cat_4" },
    { stream_id: 108, name: "FR| FRANCE 3", stream_type: "live", stream_icon: "/assets/france3.png", category_id: "cat_4" },
  ], []);

  const visibleCategories = useMemo(() => {
    if (!isReal) return demoCategoriesList;
    if (showAdult) return realCategories;
    return realCategories.filter(
      (c) => c.category_id !== "16" && !/adult|xxx|\+18|18\+|porn/i.test(c.category_name)
    );
  }, [isReal, showAdult, realCategories, demoCategoriesList]);

  // Map category_id -> category_name
  const categoriesMap = useMemo(() => {
    const map: Record<string, string> = {};
    visibleCategories.forEach((c) => {
      map[String(c.category_id)] = c.category_name;
    });
    return map;
  }, [visibleCategories]);

  // Raccourci clavier '/' ou 'Ctrl+F' pour chercher directement sans quitter le clavier
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if (
        (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") ||
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f")
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const [displayLimit, setDisplayLimit] = useState(80);

  // Recherche globale de chaînes dans tout le catalogue sans entrer dans une catégorie
  useEffect(() => {
    const term = streamSearch.trim();
    if (searchScope !== "global" || term.length < 2) {
      setGlobalResults([]);
      setSearchingGlobal(false);
      return;
    }

    if (!isReal) {
      const q = term.toLowerCase();
      const filtered = demoChannelsList.filter((s) => String(s?.name || "").toLowerCase().includes(q));
      setGlobalResults(filtered);
      return;
    }

    setSearchingGlobal(true);
    const timer = setTimeout(() => {
      fluxaApi
        .search(activeProfile.id, term, "live", showAdult)
        .then((res) => {
          setGlobalResults(res.results?.live || []);
        })
        .catch((err) => {
          console.error("Erreur recherche globale:", err);
        })
        .finally(() => {
          setSearchingGlobal(false);
        });
    }, 200);

    return () => clearTimeout(timer);
  }, [streamSearch, searchScope, isReal, activeProfile, showAdult, demoChannelsList]);

  // Reset pagination quand catégorie, recherche ou portée change
  useEffect(() => {
    setDisplayLimit(80);
  }, [selectedCategory, streamSearch, searchScope]);

  const filteredCats = useMemo(() => {
    if (!catSearch.trim()) return visibleCategories;
    const q = catSearch.toLowerCase();
    return visibleCategories.filter((c) => String(c?.category_name || "").toLowerCase().includes(q));
  }, [visibleCategories, catSearch]);

  // Split pinned and regular categories
  const pinnedCategories = useMemo(() => {
    return visibleCategories.filter((c) => pinnedCategoryIds.includes(c.category_id));
  }, [visibleCategories, pinnedCategoryIds]);

  const unpinnedCategories = useMemo(() => {
    return filteredCats.filter((c) => !pinnedCategoryIds.includes(c.category_id));
  }, [filteredCats, pinnedCategoryIds]);

  // Channels to display in the right panel
  const displayedChannels = useMemo(() => {
    if (searchScope === "global" && streamSearch.trim().length >= 2) {
      return globalResults;
    }
    let list: LiveStream[] = [];
    if (!isReal) {
      list = selectedCategory === "favorites" ? favoriteChannelsList : selectedCategory === "active" ? activeChannelsList : demoChannelsList;
    } else if (selectedCategory === "favorites") {
      list = favoriteChannelsList;
    } else if (selectedCategory === "active") {
      list = activeChannelsList;
    } else {
      list = realStreams;
    }
    if (streamSearch.trim()) {
      const q = streamSearch.toLowerCase();
      list = list.filter((s) => String(s?.name || "").toLowerCase().includes(q));
    }
    return list;
  }, [
    searchScope,
    streamSearch,
    globalResults,
    isReal,
    selectedCategory,
    favoriteChannelsList,
    activeChannelsList,
    demoChannelsList,
    realStreams,
  ]);

  const visibleChannels = useMemo(() => {
    return displayedChannels.slice(0, displayLimit);
  }, [displayedChannels, displayLimit]);

  const handlePlayChannel = (stream: LiveStream) => {
    onSelectStream(stream);
    if (onStartCinema) {
      const url = activeProfile.isDemo
        ? "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
        : fluxaApi.streamUrl(activeProfile.id, "live", stream.stream_id, "ts");
      onStartCinema({
        type: "live",
        title: stream.name,
        videoUrl: url,
        streamId: stream.stream_id,
        channel: stream,
      });
    }
  };

  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<{ tested: number; total: number; found: number } | null>(null);
  const cancelScanRef = useRef(false);

  const handleScanCategory = async () => {
    if (scanning) {
      cancelScanRef.current = true;
      setScanning(false);
      return;
    }

    if (!isReal) return;

    // Toutes les chaînes de la catégorie (ou toutes les chaînes de l'IPTV si "Toutes les chaînes")
    let candidates = [...displayedChannels];
    if (candidates.length === 0) return;

    // Si on est dans "Toutes les chaînes", on priorise les chaînes françaises, sportives et premium en tête
    if (selectedCategory === "all") {
      candidates.sort((a, b) => {
        const aName = String(a?.name || "").toLowerCase();
        const bName = String(b?.name || "").toLowerCase();
        const aPri = /fr\s*\||\[fr\]|\(fr\)|france|canal|bein|rmc|eurosport|tf1|m6|dazn/i.test(aName) ? 2 : 1;
        const bPri = /fr\s*\||\[fr\]|\(fr\)|france|canal|bein|rmc|eurosport|tf1|m6|dazn/i.test(bName) ? 2 : 1;
        return bPri - aPri;
      });
    }

    setScanning(true);
    cancelScanRef.current = false;
    let tested = 0;
    let found = 0;
    const total = candidates.length;
    setScanProgress({ tested: 0, total, found: 0 });

    const BATCH_SIZE = 50;

    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      if (cancelScanRef.current) break;
      const chunk = candidates.slice(i, i + BATCH_SIZE);
      const streamIds = chunk.map((s) => s.stream_id).filter(Boolean);

      let verifiedChunk: LiveStream[] = [];

      try {
        // Sonde ultra-rapide côté backend (50 requêtes en parallèle avec 1.5s timeout)
        const res = await fluxaApi.live.probeBatch(activeProfile.id, streamIds);
        const activeIdsSet = new Set((res.active_ids || []).map(String));
        verifiedChunk = chunk.filter((s) => activeIdsSet.has(String(s.stream_id)));
      } catch {
        // Fallback résilient côté client : 16 workers en parallèle avec timeout de 1.5s
        const clientActive: LiveStream[] = [];
        const workers = Array.from({ length: Math.min(16, chunk.length) }, async (_, wIdx) => {
          for (let cIdx = wIdx; cIdx < chunk.length && !cancelScanRef.current; cIdx += 16) {
            const s = chunk[cIdx];
            if (!s?.stream_id) continue;
            try {
              const ctrl = new AbortController();
              const timer = setTimeout(() => ctrl.abort(), 1500);
              const url = fluxaApi.streamUrl(activeProfile.id, "live", s.stream_id, "ts");
              const resp = await fetch(url, {
                method: "GET",
                headers: { Range: "bytes=0-100" },
                signal: ctrl.signal,
              });
              clearTimeout(timer);
              if (resp.ok || resp.status === 206 || resp.status === 200) {
                clientActive.push(s);
              }
            } catch {}
          }
        });
        await Promise.all(workers);
        verifiedChunk = clientActive;
      }

      if (verifiedChunk.length > 0) {
        if (markChannelsActiveBatch) {
          markChannelsActiveBatch(verifiedChunk);
        } else if (markChannelActive) {
          verifiedChunk.forEach(markChannelActive);
        }
        found += verifiedChunk.length;
      }

      tested += chunk.length;
      setScanProgress({ tested: Math.min(tested, total), total, found });
    }

    setScanning(false);
    setTimeout(() => {
      setScanProgress(null);
    }, 6000);
  };

  const selectedCatObj = visibleCategories.find((c) => c.category_id === selectedCategory);
  const currentCategoryTitle = selectedCategory === "favorites"
    ? "Chaînes favorites"
    : selectedCategory === "active"
    ? "Chaînes Actives & Vérifiées"
    : selectedCategory === "all"
    ? "Toutes les chaînes"
    : selectedCatObj?.category_name || "Toutes les chaînes";

  return (
    <div className="view-live" style={{ height: "100vh", display: "flex", overflow: "hidden" }}>
      {/* Left Categories Sidebar */}
      <aside className="live-categories-sidebar">
        <div className="live-sidebar-head">
          <span className="live-sidebar-title">Catégories</span>
          <span className="live-sidebar-badge">{visibleCategories.length}</span>
        </div>

        <div style={{ padding: "0 14px 12px" }}>
          <input
            type="text"
            className="search-pill-input"
            style={{
              width: "100%",
              height: 34,
              borderRadius: 8,
              background: "rgba(255,255,255,0.06)",
              padding: "0 10px",
              border: "1px solid rgba(255,255,255,0.1)",
              fontSize: 12.5,
            }}
            placeholder="Filtrer catégories..."
            value={catSearch}
            onChange={(e) => setCatSearch(e.target.value)}
          />
        </div>

        <div className="live-cat-list">
          {/* Toutes les chaînes Tab */}
          <div
            className={`live-cat-item ${selectedCategory === "all" ? "active" : ""}`}
            onClick={() => {
              onSelectCategory("all");
              setSearchScope("global");
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Tv size={14} color={selectedCategory === "all" ? "#f4384f" : "currentColor"} />
              <span className="live-cat-name">Toutes les chaînes</span>
            </div>
            <span className="live-cat-badge">Global</span>
          </div>

          {/* Favorites Tab */}
          <div
            className={`live-cat-item ${selectedCategory === "favorites" ? "active" : ""}`}
            onClick={() => onSelectCategory("favorites")}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Star size={14} fill={selectedCategory === "favorites" ? "currentColor" : "none"} />
              <span className="live-cat-name">Favoris</span>
            </div>
            <span className="live-cat-badge">{favoriteChannelsList.length}</span>
          </div>

          {/* Active Channels Tab */}
          <div
            className={`live-cat-item ${selectedCategory === "active" ? "active" : ""}`}
            onClick={() => onSelectCategory("active")}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Zap size={14} color="#10b981" fill={selectedCategory === "active" ? "#10b981" : "none"} />
              <span className="live-cat-name" style={{ color: selectedCategory === "active" ? "#34d399" : undefined }}>
                Chaînes Actives
              </span>
            </div>
            <span
              className="live-cat-badge"
              style={{
                background: "rgba(16, 185, 129, 0.18)",
                color: "#34d399",
                fontWeight: 700,
                border: "1px solid rgba(16, 185, 129, 0.3)",
              }}
            >
              {activeChannelIds.length}
            </span>
          </div>

          {/* Pinned Categories */}
          {pinnedCategories.length > 0 && (
            <>
              <div style={{ padding: "12px 14px 4px", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                Épinglées
              </div>
              {pinnedCategories.map((cat) => (
                <div
                  key={cat.category_id}
                  className={`live-cat-item ${selectedCategory === cat.category_id ? "active" : ""}`}
                  onClick={() => onSelectCategory(cat.category_id)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Pin size={12} fill="#f4384f" color="#f4384f" />
                    <span className="live-cat-name">{cat.category_name}</span>
                  </div>
                  <button
                    className="live-cat-pin-btn pinned"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTogglePinCategory?.(cat.category_id);
                    }}
                    title="Désépingler"
                  >
                    <Pin size={12} fill="#f4384f" />
                  </button>
                </div>
              ))}
            </>
          )}

          {/* All Categories */}
          <div style={{ padding: "12px 14px 4px", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
            Toutes les catégories
          </div>
          {unpinnedCategories.map((cat) => {
            const isAdult = cat.category_id === "16" || /adult|xxx|\+18|18\+|porn/i.test(cat.category_name);
            return (
              <div
                key={cat.category_id}
                className={`live-cat-item ${selectedCategory === cat.category_id ? "active" : ""}`}
                onClick={() => onSelectCategory(cat.category_id)}
                style={isAdult ? { color: "#fda4af" } : undefined}
              >
                <span className="live-cat-name">{isAdult ? `🔞 ${cat.category_name}` : cat.category_name}</span>
                <button
                  className="live-cat-pin-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onTogglePinCategory?.(cat.category_id);
                  }}
                  title="Épingler cette catégorie"
                >
                  <Pin size={12} />
                </button>
              </div>
            );
          })}
        </div>
      </aside>

      {/* Right Channels Pane (Grid with Big Centered Logos) */}
      <main className="live-channels-pane">
        <div className="live-pane-header">
          <div>
            <h1 className="live-pane-title">
              {streamSearch.trim().length >= 2 && searchScope === "global"
                ? `Résultats pour "${streamSearch}"`
                : currentCategoryTitle}
            </h1>
            <span className="live-pane-count">
              {displayedChannels.length} chaîne(s){" "}
              {searchScope === "global" && streamSearch.trim().length >= 2
                ? "trouvée(s) dans tout le catalogue"
                : "disponible(s)"}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Scan / Test button */}
            {isReal && (markChannelActive || markChannelsActiveBatch) && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button
                  type="button"
                  className={`scanner-btn ${scanning ? "scanning" : ""}`}
                  onClick={handleScanCategory}
                  title={
                    selectedCategory === "all"
                      ? "Tester l'intégralité des chaînes de l'abonnement IPTV et enregistrer les actives"
                      : "Tester les chaînes affichées et enregistrer les actives"
                  }
                >
                  {scanning ? (
                    <>
                      <RefreshCw size={13} className="spin" />
                      <span>
                        Scan : {scanProgress ? `${scanProgress.tested.toLocaleString("fr-FR")} / ${scanProgress.total.toLocaleString("fr-FR")}` : ""} · {scanProgress?.found || 0} active(s)
                      </span>
                    </>
                  ) : (
                    <>
                      <Zap size={13} />
                      <span>
                        {selectedCategory === "all"
                          ? `Tester TOUTES les chaînes (${displayedChannels.length.toLocaleString("fr-FR")})`
                          : selectedCategory === "active"
                          ? `Re-tester les chaînes actives (${displayedChannels.length.toLocaleString("fr-FR")})`
                          : `Tester cette catégorie (${displayedChannels.length.toLocaleString("fr-FR")})`}
                      </span>
                    </>
                  )}
                </button>
                {scanning && (
                  <button
                    type="button"
                    className="btn-glass"
                    style={{ padding: "6px 12px", fontSize: 11, color: "#f87171", borderColor: "rgba(239, 68, 68, 0.3)" }}
                    onClick={() => { cancelScanRef.current = true; }}
                  >
                    Arrêter
                  </button>
                )}
              </div>
            )}

            <div className="live-search-wrapper">
              <div className="live-search-scope-pills">
                <button
                  type="button"
                  className={`scope-pill ${searchScope === "global" ? "active" : ""}`}
                  onClick={() => setSearchScope("global")}
                  title="Rechercher dans toutes les chaînes sans restriction de catégorie"
                >
                  Tout le catalogue
                </button>
                <button
                  type="button"
                  className={`scope-pill ${searchScope === "category" ? "active" : ""}`}
                  onClick={() => setSearchScope("category")}
                  title="Rechercher uniquement dans la catégorie sélectionnée"
                >
                  Catégorie active
                </button>
              </div>

              <div className="live-search-input-box">
                <Search size={14} className="search-icon" />
                <input
                  ref={searchInputRef}
                  type="text"
                  className="live-search-field"
                  placeholder={
                    searchScope === "global"
                      ? "Taper une chaîne (ex: TF1, Canal, BeIN)... [/]"
                      : "Filtrer dans cette catégorie..."
                  }
                  value={streamSearch}
                  onChange={(e) => setStreamSearch(e.target.value)}
                />
                {searchingGlobal && (
                  <RefreshCw size={13} className="spin search-spinner" />
                )}
                {streamSearch && (
                  <button
                    type="button"
                    className="search-clear-btn"
                    onClick={() => setStreamSearch("")}
                    title="Effacer la recherche"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300, color: "#94a3b8", gap: 10 }}>
            <RefreshCw className="spin" size={24} />
            <span>Chargement des chaînes...</span>
          </div>
        ) : displayedChannels.length > 0 ? (
          <>
            <div className="live-grid">
              {visibleChannels.map((stream, idx) => {
                const streamId = stream?.stream_id ?? `stream-${idx}`;
                const isFav = favoriteChannelIds.includes(String(streamId));
                const isActive = activeChannelIds.includes(String(streamId));
                const streamName = String(stream?.name || "Chaîne");
                const catName = stream?.category_id ? categoriesMap[String(stream.category_id)] : undefined;
                return (
                  <div
                    key={streamId}
                    className="channel-card"
                    onClick={() => handlePlayChannel(stream)}
                  >
                    {isActive && (
                      <span className="channel-online-tag" title="Flux vérifié et opérationnel">
                        <span className="channel-online-dot" /> En ligne
                      </span>
                    )}
                    <button
                      className={`favorite-button ${isFav ? "selected" : ""}`}
                      style={{ position: "absolute", top: 10, right: 10, zIndex: 2 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavoriteChannel(stream);
                      }}
                      title={isFav ? "Retirer des favoris" : "Ajouter aux favoris"}
                    >
                      <Heart size={16} fill={isFav ? "#f4384f" : "none"} color={isFav ? "#f4384f" : "#cbd5e1"} />
                    </button>

                    <div className="channel-card-logo-box">
                      {stream?.stream_icon ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={stream.stream_icon} alt={streamName} />
                      ) : (
                        <div style={{ height: 48, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color: "#64748b" }}>
                          {streamName.slice(0, 3).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <span className="channel-card-name">{streamName}</span>
                    {(searchScope === "global" || selectedCategory === "all") && catName && (
                      <span className="channel-card-category-tag" title={catName}>
                        {catName}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {displayedChannels.length > displayLimit && (
              <div
                style={{
                  textAlign: "center",
                  padding: "24px 0 40px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span style={{ fontSize: 12, color: "#64748b" }}>
                  Affichage de {Math.min(displayLimit, displayedChannels.length).toLocaleString("fr-FR")} sur{" "}
                  {displayedChannels.length.toLocaleString("fr-FR")} chaînes
                </span>
                <button
                  type="button"
                  className="btn-glass"
                  style={{
                    padding: "8px 24px",
                    fontSize: 13,
                    cursor: "pointer",
                    borderColor: "rgba(244, 56, 79, 0.4)",
                  }}
                  onClick={() => setDisplayLimit((prev) => prev + 100)}
                >
                  Afficher 100 chaînes de plus
                </button>
              </div>
            )}
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "80px 20px", color: "#64748b" }}>
            <Tv size={48} style={{ opacity: 0.4, margin: "0 auto 16px" }} />
            <h3 style={{ color: "#fff", fontSize: 16, marginBottom: 6 }}>
              {streamSearch.trim() ? `Aucune chaîne correspondant à "${streamSearch}"` : "Aucune chaîne trouvée"}
            </h3>
            <p style={{ fontSize: 13 }}>
              {streamSearch.trim().length === 1 && searchScope === "global"
                ? "Tapez au moins 2 caractères pour rechercher dans tout le catalogue."
                : "Essayez une autre recherche ou sélectionnez une catégorie différente."}
            </p>
            {streamSearch && (
              <button
                type="button"
                className="btn-glass"
                style={{ marginTop: 14, fontSize: 12, padding: "6px 14px", cursor: "pointer" }}
                onClick={() => setStreamSearch("")}
              >
                Réinitialiser la recherche
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}


function CatalogView({
  type,
  activeProfile,
  vodCategories,
  selectedVodCategory,
  onSelectVodCategory,
  seriesCategories,
  selectedSeriesCategory,
  onSelectSeriesCategory,
  movies,
  series,
  loading,
  onPlayMovie,
  onOpenSeriesDetail,
  favorites,
  toggleFavorite,
  showAdult = true,
}: {
  type: MediaType;
  activeProfile: ActiveProfile;
  vodCategories: VodCategory[];
  selectedVodCategory: string;
  onSelectVodCategory: (id: string) => void;
  seriesCategories: any[];
  selectedSeriesCategory: string;
  onSelectSeriesCategory: (id: string) => void;
  movies: VodMovie[];
  series: SeriesItem[];
  loading: boolean;
  onPlayMovie: (movie: VodMovie) => void;
  onOpenSeriesDetail?: (series: SeriesItem) => void;
  favorites: string[];
  toggleFavorite: (id: string) => void;
  showAdult?: boolean;
}) {
  const isReal = !activeProfile.isDemo;
  const [catalogSearch, setCatalogSearch] = useState("");
  const [displayLimit, setDisplayLimit] = useState(80);

  // Reset pagination quand catégorie, vue ou recherche change
  useEffect(() => {
    setDisplayLimit(80);
  }, [type, selectedVodCategory, selectedSeriesCategory, catalogSearch]);

  const visibleVodCategories = useMemo(() => {
    return showAdult ? vodCategories : vodCategories.filter((c) => !isAdultCategory(c));
  }, [vodCategories, showAdult]);

  const visibleSeriesCategories = useMemo(() => {
    return showAdult ? seriesCategories : seriesCategories.filter((c) => !isAdultCategory(c));
  }, [seriesCategories, showAdult]);

  const sortedVodCategories = useMemo(() => {
    return [...visibleVodCategories].sort((a, b) => {
      const aName = (a.category_name || "").toUpperCase();
      const bName = (b.category_name || "").toUpperCase();
      const aFr = aName.includes("FR -") || aName.includes("FR |") || aName.includes("FRANCE") || aName.includes("FRENCH");
      const bFr = bName.includes("FR -") || bName.includes("FR |") || bName.includes("FRANCE") || bName.includes("FRENCH");
      if (aFr && !bFr) return -1;
      if (!aFr && bFr) return 1;
      return aName.localeCompare(bName);
    });
  }, [visibleVodCategories]);

  const sortedSeriesCategories = useMemo(() => {
    return [...visibleSeriesCategories].sort((a, b) => {
      const aName = (a.category_name || "").toUpperCase();
      const bName = (b.category_name || "").toUpperCase();
      const aFr = aName.includes("FR -") || aName.includes("FR |") || aName.includes("FRANCE") || aName.includes("FRENCH");
      const bFr = bName.includes("FR -") || bName.includes("FR |") || bName.includes("FRANCE") || bName.includes("FRENCH");
      if (aFr && !bFr) return -1;
      if (!aFr && bFr) return 1;
      return aName.localeCompare(bName);
    });
  }, [visibleSeriesCategories]);

  const visibleMoviesList = useMemo(() => {
    return showAdult ? movies : movies.filter((m) => !isAdultItem(m));
  }, [movies, showAdult]);

  const visibleSeriesList = useMemo(() => {
    return showAdult ? series : series.filter((s) => !isAdultItem(s));
  }, [series, showAdult]);

  const filteredMovies = useMemo(() => {
    if (!catalogSearch.trim()) return visibleMoviesList;
    const term = catalogSearch.toLowerCase().trim();
    return visibleMoviesList.filter((m) => (m.name || "").toLowerCase().includes(term));
  }, [visibleMoviesList, catalogSearch]);

  const filteredSeries = useMemo(() => {
    if (!catalogSearch.trim()) return visibleSeriesList;
    const term = catalogSearch.toLowerCase().trim();
    return visibleSeriesList.filter(
      (s) =>
        (s.name || "").toLowerCase().includes(term) ||
        (s.genre && s.genre.toLowerCase().includes(term)) ||
        (s.cast && s.cast.toLowerCase().includes(term))
    );
  }, [visibleSeriesList, catalogSearch]);

  const visibleMovies = useMemo(() => filteredMovies.slice(0, displayLimit), [filteredMovies, displayLimit]);
  const visibleSeries = useMemo(() => filteredSeries.slice(0, displayLimit), [filteredSeries, displayLimit]);

  if (!isReal) {
    const items = media.filter((item) => item.type === type);
    return (
      <div className="view-stack">
        <div className="page-heading">
          <div><p className="eyebrow">CATALOGUE</p><h1>{type === "film" ? "Films" : "Séries"}</h1><p>{type === "film" ? "3 842 films disponibles" : "1 207 séries disponibles"}</p></div>
          <div className="heading-actions"><button className="button button-ghost compact"><SlidersHorizontal size={17} /> Filtres</button><button className="button button-ghost compact">Populaires <ChevronDown size={16} /></button></div>
        </div>
        <div className="genre-pills">{["Tous", "Action", "Drame", "Comédie", "Thriller", "Documentaire", "Jeunesse"].map((genre, index) => <button className={index === 0 ? "active" : ""} key={genre}>{genre}</button>)}</div>
        <section className="catalog-grid">
          {[...items, ...items].map((item, index) => (
            <MediaCard
              key={`${item.id}-${index}`}
              item={item}
              favorite={favorites.includes(item.id)}
              toggleFavorite={toggleFavorite}
              onPlay={(med) => {
                onPlayMovie({
                  stream_id: med.id,
                  name: med.title,
                  stream_icon: med.poster,
                  container_extension: "mp4",
                  rating_5based: med.rating,
                  duration: med.duration,
                  genre: med.genre,
                  year: med.year,
                  videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
                } as any);
              }}
            />
          ))}
        </section>
      </div>
    );
  }

  // Version REELLE VOD / Séries
  const rawTotal = type === "film" ? movies.length : series.length;
  const isAll = (type === "film" ? selectedVodCategory : selectedSeriesCategory) === "all";

  return (
    <div className="view-stack">
      <div className="page-heading" style={{ flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
        <div>
          <p className="eyebrow">CATALOGUE {type === "film" ? "VOD" : "SÉRIES"}</p>
          <h1 style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {type === "film" ? "Films" : "Séries"}
            <span
              className="app-count-badge"
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "#70a8ff",
                background: "rgba(47, 124, 247, 0.15)",
                padding: "2px 10px",
                borderRadius: 20,
              }}
            >
              {loading ? "Chargement..." : `${rawTotal.toLocaleString("fr-FR")} disponibles`}
            </span>
          </h1>
          <p>
            {type === "film"
              ? `${vodCategories.length} catégories de films · Catalogue complet mondial & français`
              : `${seriesCategories.length} catégories de séries · Saisons et épisodes complets`}
          </p>
        </div>

        {/* Barre de recherche instantanée dans le catalogue */}
        <div style={{ position: "relative", minWidth: 260, maxWidth: 380, width: "100%" }}>
          <Search
            size={16}
            style={{
              position: "absolute",
              left: 14,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--muted)",
              pointerEvents: "none",
            }}
          />
          <input
            type="text"
            placeholder={type === "film" ? "Rechercher parmi tous les films..." : "Rechercher une série..."}
            value={catalogSearch}
            onChange={(e) => setCatalogSearch(e.target.value)}
            style={{
              width: "100%",
              background: "var(--panel2)",
              border: "1px solid var(--line)",
              borderRadius: 10,
              padding: "10px 38px 10px 38px",
              color: "var(--text)",
              fontSize: 13,
              outline: "none",
            }}
          />
          {catalogSearch && (
            <button
              onClick={() => setCatalogSearch("")}
              style={{
                position: "absolute",
                right: 12,
                top: "50%",
                transform: "translateY(-50%)",
                background: "transparent",
                border: "none",
                color: "var(--muted)",
                cursor: "pointer",
                padding: 2,
              }}
              title="Effacer"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Barre de catégories avec 'Tous' au tout début */}
      <div className="genre-pills" style={{ overflowX: "auto", paddingBottom: 8, display: "flex", gap: 8 }}>
        <button
          className={isAll ? "active" : ""}
          onClick={() => (type === "film" ? onSelectVodCategory("all") : onSelectSeriesCategory("all"))}
          style={{ whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}
        >
          <Sparkles size={14} />
          {type === "film" ? "Tous les films" : "Toutes les séries"}
          <span style={{ opacity: 0.75, fontSize: 11 }}>
            ({rawTotal > 0 && isAll ? rawTotal.toLocaleString("fr-FR") : (type === "film" ? "179k+" : "47k+")})
          </span>
        </button>

        {(type === "film" ? sortedVodCategories : sortedSeriesCategories).map((cat) => {
          const isSelected = (type === "film" ? selectedVodCategory : selectedSeriesCategory) === cat.category_id;
          const isAdult = cat.category_id === "382" || /adult|xxx|\+18|18\+|porn/i.test(cat.category_name);
          return (
            <button
              key={cat.category_id}
              className={isSelected ? "active" : ""}
              onClick={() => (type === "film" ? onSelectVodCategory(cat.category_id) : onSelectSeriesCategory(cat.category_id))}
              style={{
                whiteSpace: "nowrap",
                ...(isAdult ? { color: isSelected ? "#fff" : "#fda4af", border: "1px solid " + (isSelected ? "#e11d48" : "rgba(225, 29, 72, 0.4)") } : {}),
              }}
            >
              {isAdult ? `🔞 ${cat.category_name}` : cat.category_name}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div
          className="content-loading"
          style={{
            minHeight: 280,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
            padding: 40,
          }}
        >
          <RefreshCw className="spin" size={32} style={{ color: "var(--blue)" }} />
          <div style={{ textAlign: "center" }}>
            <strong style={{ fontSize: 16, display: "block", color: "var(--text)", marginBottom: 4 }}>
              Chargement de l'ensemble du catalogue...
            </strong>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>
              {type === "film"
                ? "Synchronisation des 179 000+ films en cours..."
                : "Synchronisation des 47 000+ séries en cours..."}
            </span>
          </div>
        </div>
      ) : type === "film" ? (
        <>
          <section className="catalog-grid">
            {visibleMovies.map((movie) => (
              <article className="media-card" key={movie.stream_id}>
                <div className="media-art" onClick={() => onPlayMovie(movie)} style={{ cursor: "pointer" }}>
                  <SafeImage src={movie.stream_icon} alt={movie.name} fallbackText={movie.name} />
                  {movie.rating_5based ? <span className="rating">★ {movie.rating_5based}</span> : null}
                  <button
                    className={`favorite-button ${favorites.includes(String(movie.stream_id)) ? "selected" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(String(movie.stream_id));
                    }}
                    aria-label="Favoris"
                  >
                    <Heart size={17} fill={favorites.includes(String(movie.stream_id)) ? "currentColor" : "none"} />
                  </button>
                  <button className="card-play" aria-label={`Lire ${movie.name}`}>
                    <Play size={21} fill="currentColor" />
                  </button>
                </div>
                <h3>{movie.name}</h3>
                <p>{movie.container_extension?.toUpperCase() || "MP4"}</p>
              </article>
            ))}
          </section>

          {visibleMovies.length === 0 && (
            <div className="empty-compact">
              {catalogSearch ? `Aucun film correspondant à "${catalogSearch}".` : "Aucun film dans cette catégorie."}
            </div>
          )}

          {filteredMovies.length > displayLimit && (
            <div
              style={{
                textAlign: "center",
                margin: "36px 0 24px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
              }}
            >
              <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>
                Affichage de <b style={{ color: "var(--text)" }}>{Math.min(displayLimit, filteredMovies.length).toLocaleString("fr-FR")}</b> sur{" "}
                <b style={{ color: "var(--text)" }}>{filteredMovies.length.toLocaleString("fr-FR")}</b> films
              </p>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
                <button
                  className="button button-primary"
                  onClick={() => setDisplayLimit((prev) => Math.min(prev + 80, filteredMovies.length))}
                  style={{ padding: "10px 24px" }}
                >
                  Afficher 80 films de plus
                </button>
                {filteredMovies.length - displayLimit > 200 && (
                  <button
                    className="button button-ghost"
                    onClick={() => setDisplayLimit((prev) => Math.min(prev + 500, filteredMovies.length))}
                    style={{ padding: "10px 24px" }}
                  >
                    Afficher +500 films
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <section className="catalog-grid">
            {visibleSeries.map((item) => (
              <article className="media-card" key={item.series_id}>
                <div
                  className="media-art"
                  onClick={() => {
                    if (onOpenSeriesDetail) {
                      onOpenSeriesDetail(item);
                    } else {
                      onPlayMovie({
                        stream_id: item.series_id,
                        name: item.name,
                        stream_icon: item.cover,
                        container_extension: "mp4",
                        rating_5based: item.rating,
                      } as any);
                    }
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <SafeImage src={item.cover} alt={item.name} fallbackText={item.name} />
                  {item.rating ? <span className="rating">★ {item.rating}</span> : null}
                  <button className="card-play" aria-label={`Voir les épisodes de ${item.name}`}>
                    <Play size={21} fill="currentColor" />
                  </button>
                </div>
                <h3>{item.name}</h3>
                <p>{item.genre || "Série"}</p>
              </article>
            ))}
          </section>

          {visibleSeries.length === 0 && (
            <div className="empty-compact">
              {catalogSearch ? `Aucune série correspondante à "${catalogSearch}".` : "Aucune série dans cette catégorie."}
            </div>
          )}

          {filteredSeries.length > displayLimit && (
            <div
              style={{
                textAlign: "center",
                margin: "36px 0 24px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
              }}
            >
              <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>
                Affichage de <b style={{ color: "var(--text)" }}>{Math.min(displayLimit, filteredSeries.length).toLocaleString("fr-FR")}</b> sur{" "}
                <b style={{ color: "var(--text)" }}>{filteredSeries.length.toLocaleString("fr-FR")}</b> séries
              </p>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
                <button
                  className="button button-primary"
                  onClick={() => setDisplayLimit((prev) => Math.min(prev + 80, filteredSeries.length))}
                  style={{ padding: "10px 24px" }}
                >
                  Afficher 80 séries de plus
                </button>
                {filteredSeries.length - displayLimit > 200 && (
                  <button
                    className="button button-ghost"
                    onClick={() => setDisplayLimit((prev) => Math.min(prev + 500, filteredSeries.length))}
                    style={{ padding: "10px 24px" }}
                  >
                    Afficher +500 séries
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FavoritesView({
  activeProfile,
  favoriteChannels,
  onSelectStream,
  onOpenDetail,
  onPlayMovie,
  toggleFavoriteChannel,
  changeView,
  favorites,
  toggleFavorite,
  vodMovies = [],
  seriesList = [],
}: {
  activeProfile: ActiveProfile;
  favoriteChannels: LiveStream[];
  onSelectStream: (stream: LiveStream) => void;
  onOpenDetail?: (media: any) => void;
  onPlayMovie?: (movie: VodMovie) => void;
  toggleFavoriteChannel: (stream: LiveStream) => void;
  changeView: (view: View) => void;
  favorites: string[];
  toggleFavorite: (id: string) => void;
  demoChannels?: Channel[];
  demoSelect?: (ch: Channel) => void;
  vodMovies?: VodMovie[];
  seriesList?: SeriesItem[];
}) {
  const [filter, setFilter] = useState<"all" | "channels" | "movies" | "series">("all");

  const favoriteMovies = useMemo(() => {
    return vodMovies.filter((m) => favorites.includes(String(m.stream_id)));
  }, [vodMovies, favorites]);

  const favoriteSeries = useMemo(() => {
    return seriesList.filter((s) => favorites.includes(String(s.series_id)));
  }, [seriesList, favorites]);

  const totalCount = favoriteChannels.length + favoriteMovies.length + favoriteSeries.length + favorites.length;

  return (
    <div className="view-favorites" style={{ minHeight: "100vh", padding: "36px 44px 60px" }}>
      <div className="my-list-head">
        <h1 className="my-list-title">Ma liste</h1>
        <div className="my-list-count">{totalCount} titre(s) dans votre liste</div>

        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          <button
            className={`quick-filter-btn ${filter === "all" ? "active" : ""}`}
            onClick={() => setFilter("all")}
          >
            Tous
          </button>
          <button
            className={`quick-filter-btn ${filter === "channels" ? "active" : ""}`}
            onClick={() => setFilter("channels")}
          >
            Chaînes ({favoriteChannels.length})
          </button>
          <button
            className={`quick-filter-btn ${filter === "movies" ? "active" : ""}`}
            onClick={() => setFilter("movies")}
          >
            Films ({favoriteMovies.length})
          </button>
          <button
            className={`quick-filter-btn ${filter === "series" ? "active" : ""}`}
            onClick={() => setFilter("series")}
          >
            Séries ({favoriteSeries.length})
          </button>
        </div>
      </div>

      {totalCount === 0 && !activeProfile.isDemo ? (
        <div style={{ textAlign: "center", padding: "100px 20px", color: "#64748b" }}>
          <Heart size={48} style={{ opacity: 0.3, margin: "0 auto 16px" }} />
          <h3 style={{ color: "#fff", fontSize: 17, marginBottom: 6 }}>Votre liste est vide</h3>
          <p style={{ fontSize: 13, maxWidth: 360, margin: "0 auto 20px", lineHeight: 1.5 }}>
            Ajoutez vos films, séries et chaînes TV préférés en cliquant sur le bouton « + » ou l'icône de cœur.
          </p>
          <button className="btn-pill-resume" onClick={() => changeView("home")}>
            Découvrir des contenus
          </button>
        </div>
      ) : (
        <div className="my-list-grid">
          {/* Demo items matching Screenshot 3 */}
          {activeProfile.isDemo && [
            { id: "fav_1", title: "One Piece--it", cover: "/assets/cw_onepiece.jpg", rating: "8.9" },
            { id: "fav_2", title: "My Hero Academia-it", cover: "/assets/cw_op_anime.jpg", rating: "8.4" },
            { id: "fav_3", title: "Dean - 2016", cover: "/assets/crime101.jpg", rating: "6.9" },
            { id: "fav_4", title: "Landscape with Invisible Hand", cover: "/assets/hailmary.jpg", rating: "7.1" },
            { id: "fav_5", title: "Chainsaw Man - The Movie", cover: "/assets/daredevil.jpg", rating: "8.5" },
            { id: "fav_6", title: "DE - Shelter (2026)", cover: "/assets/inter.jpg", rating: "7.8" },
            { id: "fav_7", title: "EN - Hoppers - 2026", cover: "/assets/mario_card.jpg", rating: "7.3" },
            { id: "fav_8", title: "DE - Send Help - 2026 4K", cover: "/assets/scream7.jpg", rating: "6.8" },
          ].map((item) => (
            <div
              key={item.id}
              className="nyx-card"
              onClick={() => onOpenDetail?.({ name: item.title, cover: item.cover, stream_icon: item.cover, rating: item.rating })}
            >
              <button
                className="favorite-button selected"
                style={{ position: "absolute", top: 8, right: 8, zIndex: 2 }}
                title="Retirer de ma liste"
              >
                <Heart size={16} fill="#f4384f" color="#f4384f" />
              </button>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.cover} alt={item.title} />
              <div className="nyx-card-title-overlay">{item.title}</div>
            </div>
          ))}
          {/* Favorite Channels */}
          {(filter === "all" || filter === "channels") &&
            favoriteChannels.map((stream) => (
              <div
                key={`ch_${stream.stream_id}`}
                className="channel-card"
                onClick={() => onSelectStream(stream)}
              >
                <button
                  className="favorite-button selected"
                  style={{ position: "absolute", top: 8, right: 8, zIndex: 2 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavoriteChannel(stream);
                  }}
                  title="Retirer des favoris"
                >
                  <Heart size={16} fill="#f4384f" color="#f4384f" />
                </button>
                <div className="channel-card-logo-box">
                  {stream.stream_icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={stream.stream_icon} alt={stream.name} />
                  ) : (
                    <div style={{ height: 48, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color: "#64748b" }}>
                      {stream.name.slice(0, 3)}
                    </div>
                  )}
                </div>
                <span className="channel-card-name">{stream.name}</span>
              </div>
            ))}

          {/* Favorite Movies */}
          {(filter === "all" || filter === "movies") &&
            favoriteMovies.map((movie) => (
              <div
                key={`mov_${movie.stream_id}`}
                className="nyx-card"
                onClick={() => {
                  if (onOpenDetail) onOpenDetail(movie);
                  else if (onPlayMovie) onPlayMovie(movie);
                }}
              >
                <span className="nyx-card-rating">★ {movie.rating_5based || "7.5"}</span>
                <button
                  className="favorite-button selected"
                  style={{ position: "absolute", top: 8, left: 8, zIndex: 2 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(String(movie.stream_id));
                  }}
                  title="Retirer de ma liste"
                >
                  <Heart size={16} fill="#f4384f" color="#f4384f" />
                </button>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={movie.stream_icon || "/assets/avatar_card.jpg"} alt={movie.name} />
                <div className="nyx-card-title-overlay">{movie.name}</div>
              </div>
            ))}

          {/* Favorite Series */}
          {(filter === "all" || filter === "series") &&
            favoriteSeries.map((ser) => (
              <div
                key={`ser_${ser.series_id}`}
                className="nyx-card"
                onClick={() => onOpenDetail?.({ ...ser, kind: "series" })}
              >
                <span className="nyx-card-rating">★ {ser.rating || "8.0"}</span>
                <button
                  className="favorite-button selected"
                  style={{ position: "absolute", top: 8, left: 8, zIndex: 2 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(String(ser.series_id));
                  }}
                  title="Retirer de ma liste"
                >
                  <Heart size={16} fill="#f4384f" color="#f4384f" />
                </button>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ser.cover || "/assets/avatar_card.jpg"} alt={ser.name} />
                <div className="nyx-card-title-overlay">{ser.name}</div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}



function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / (1000 * 60));
  if (minutes < 1) return "À l'instant";
  if (minutes < 60) return `Il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Hier";
  if (days < 7) return `Il y a ${days} j`;
  return new Date(timestamp).toLocaleDateString("fr-FR");
}

function HistoryView({
  historyItems,
  onClearHistory,
  onRemoveItem,
  onSelectStream,
  onPlayMovie,
  changeView,
  liveStreams,
  vodMovies,
  demoChannels,
  demoSelect,
}: {
  historyItems: HistoryItem[];
  onClearHistory: () => void;
  onRemoveItem: (id: string) => void;
  onSelectStream: (stream: LiveStream) => void;
  onPlayMovie: (movie: VodMovie) => void;
  changeView: (view: View) => void;
  liveStreams: LiveStream[];
  vodMovies: VodMovie[];
  demoChannels: Channel[];
  demoSelect: (ch: Channel) => void;
}) {
  const [activeTab, setActiveTab] = useState<"all" | "channels" | "movies" | "series">("all");
  const [search, setSearch] = useState("");

  const counts = useMemo(() => {
    return {
      all: historyItems.length,
      channels: historyItems.filter((i) => i.category === "channels").length,
      movies: historyItems.filter((i) => i.category === "movies").length,
      series: historyItems.filter((i) => i.category === "series").length,
    };
  }, [historyItems]);

  const filteredItems = useMemo(() => {
    let list = historyItems;
    if (activeTab !== "all") {
      list = list.filter((i) => i.category === activeTab);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          (i.subtitle && i.subtitle.toLowerCase().includes(q))
      );
    }
    return list;
  }, [historyItems, activeTab, search]);

  const handlePlay = (item: HistoryItem) => {
    if (item.category === "channels") {
      if (item.rawStream) {
        onSelectStream(item.rawStream);
        changeView("live");
      } else if (item.rawDemoChannel) {
        demoSelect(item.rawDemoChannel);
        changeView("live");
      } else if (liveStreams.length > 0) {
        const found = liveStreams.find(
          (s) =>
            String(s.stream_id) === String(item.stream_id) ||
            s.name.toLowerCase() === item.title.toLowerCase()
        );
        onSelectStream(found || liveStreams[0]);
        changeView("live");
      } else if (demoChannels.length > 0) {
        const foundDemo = demoChannels.find(
          (c) => c.name.toLowerCase() === item.title.toLowerCase()
        );
        if (foundDemo) demoSelect(foundDemo);
        changeView("live");
      } else {
        changeView("live");
      }
    } else if (item.category === "movies") {
      if (item.rawMovie) {
        onPlayMovie(item.rawMovie);
      } else {
        const found = vodMovies.find(
          (m) =>
            String(m.stream_id) === String(item.stream_id) ||
            m.name.toLowerCase().includes(item.title.toLowerCase().slice(0, 5))
        );
        if (found) {
          onPlayMovie(found);
        } else {
          onPlayMovie({
            stream_id: item.stream_id || item.id,
            name: item.title,
            stream_icon: item.poster,
            container_extension: "mp4",
            rating_5based: item.badge ? parseFloat(item.badge.replace(/[^0-9.]/g, "")) : 8.5,
            duration: item.duration,
            videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
          } as any);
        }
      }
    } else if (item.category === "series") {
      changeView("series");
    }
  };

  return (
    <div className="view-stack history-view">
      {/* En-tête de la page */}
      <div className="page-heading" style={{ flexWrap: "wrap", gap: 16 }}>
        <div>
          <p className="eyebrow" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <History size={14} color="#78adff" /> VOS LECTURES RÉCENTES
          </p>
          <h1 style={{ display: "flex", alignItems: "center", gap: 12 }}>
            Historique de lecture
            <span
              className="app-count-badge"
              style={{
                background: "rgba(120, 173, 255, 0.2)",
                color: "#78adff",
                fontSize: 13,
                padding: "3px 10px",
                borderRadius: 20,
              }}
            >
              {counts[activeTab]}
            </span>
          </h1>
          <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
            Reprenez vos chaînes en direct, films et séries là où vous vous êtes arrêté.
          </p>
        </div>

        {historyItems.length > 0 && (
          <div className="history-actions-bar">
            <div className="history-search-input">
              <Search size={16} />
              <input
                type="text"
                placeholder="Rechercher dans l'historique..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer" }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <button
              className="history-clear-btn"
              onClick={onClearHistory}
              title="Vider l'ensemble de l'historique"
            >
              <Trash2 size={15} />
              <span>Vider</span>
            </button>
          </div>
        )}
      </div>

      {/* Les Onglets Catégories : Chaînes en direct | Films | Séries */}
      <div className="history-tabs-container">
        <div className="history-tabs">
          <button
            className={`history-tab ${activeTab === "all" ? "active" : ""}`}
            onClick={() => setActiveTab("all")}
          >
            <span>Tout</span>
            <span className="count-pill">{counts.all}</span>
          </button>
          <button
            className={`history-tab ${activeTab === "channels" ? "active" : ""}`}
            onClick={() => setActiveTab("channels")}
          >
            <Tv size={15} />
            <span>Chaînes en direct</span>
            <span className="count-pill">{counts.channels}</span>
          </button>
          <button
            className={`history-tab ${activeTab === "movies" ? "active" : ""}`}
            onClick={() => setActiveTab("movies")}
          >
            <Film size={15} />
            <span>Films</span>
            <span className="count-pill">{counts.movies}</span>
          </button>
          <button
            className={`history-tab ${activeTab === "series" ? "active" : ""}`}
            onClick={() => setActiveTab("series")}
          >
            <Clapperboard size={15} />
            <span>Séries</span>
            <span className="count-pill">{counts.series}</span>
          </button>
        </div>
      </div>

      {/* Liste des éléments de l'historique filtrés par onglet */}
      {filteredItems.length > 0 ? (
        <div className="history-list">
          {filteredItems.map((item) => (
            <article className="history-card" key={item.id}>
              {/* Vignette / Artwork */}
              <div
                className="history-thumb-box"
                onClick={() => handlePlay(item)}
                style={{ cursor: "pointer" }}
                title="Reprendre la lecture"
              >
                {item.logo ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={item.logo} alt={item.title} className="logo" />
                ) : item.poster ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={item.poster} alt={item.title} />
                ) : (
                  <Tv size={28} color="var(--muted)" />
                )}
                <div className="history-card-hover-play">
                  <Play size={24} fill="currentColor" />
                </div>
              </div>

              {/* Détails du média */}
              <div className="history-card-details">
                <div className="history-tag-row">
                  {item.category === "channels" && (
                    <span className="history-badge channel">
                      ● Direct
                    </span>
                  )}
                  {item.category === "movies" && (
                    <span className="history-badge movie">
                      Film VOD
                    </span>
                  )}
                  {item.category === "series" && (
                    <span className="history-badge series">
                      Série
                    </span>
                  )}
                  {item.badge && item.category !== "channels" && (
                    <span
                      style={{
                        fontSize: 11,
                        color: "#f59e0b",
                        fontWeight: 750,
                        background: "rgba(245, 158, 11, 0.12)",
                        padding: "1px 6px",
                        borderRadius: 4,
                      }}
                    >
                      {item.badge}
                    </span>
                  )}
                </div>

                <h3
                  className="history-title"
                  onClick={() => handlePlay(item)}
                  style={{ cursor: "pointer" }}
                  title={item.title}
                >
                  {item.title}
                </h3>
                <p className="history-subtitle">{item.subtitle}</p>

                <div className="history-meta-info">
                  <span className="history-meta-item">
                    Regardé {formatTimeAgo(item.timestamp)}
                  </span>
                  {item.duration && (
                    <span className="history-meta-item">
                      • Durée : {item.duration}
                    </span>
                  )}
                  {item.progress !== undefined && item.progress > 0 && (
                    <div className="history-progress-wrap">
                      <div className="history-progress-track">
                        <div
                          className="history-progress-bar-fill"
                          style={{ width: `${Math.min(item.progress, 100)}%` }}
                        />
                      </div>
                      <span style={{ fontSize: 11, color: "#9aa8bb", whiteSpace: "nowrap" }}>
                        {item.progress}%
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Boutons d'action */}
              <div className="history-card-btns">
                <button
                  className="history-play-action-btn"
                  onClick={() => handlePlay(item)}
                  title="Lancer le contenu"
                >
                  <Play size={15} fill="currentColor" />
                  <span>
                    {item.category === "channels"
                      ? "Direct"
                      : item.progress && item.progress > 0
                      ? "Reprendre"
                      : "Regarder"}
                  </span>
                </button>
                <button
                  className="history-remove-btn"
                  onClick={() => onRemoveItem(item.id)}
                  title="Supprimer de l'historique"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        /* Empty State */
        <div className="history-empty-box">
          <div className="history-empty-icon">
            {activeTab === "channels" ? (
              <Tv size={28} />
            ) : activeTab === "movies" ? (
              <Film size={28} />
            ) : activeTab === "series" ? (
              <Clapperboard size={28} />
            ) : (
              <History size={28} />
            )}
          </div>
          <h3>
            {search
              ? "Aucun résultat trouvé"
              : activeTab === "channels"
              ? "Aucune chaîne dans l'historique"
              : activeTab === "movies"
              ? "Aucun film dans l'historique"
              : activeTab === "series"
              ? "Aucune série dans l'historique"
              : "Votre historique est vide"}
          </h3>
          <p>
            {search
              ? `Aucun contenu ne correspond à "${search}".`
              : activeTab === "channels"
              ? "Regardez des chaînes en direct pour les retrouver instantanément ici."
              : activeTab === "movies"
              ? "Lancez un film pour sauvegarder votre progression et reprendre à tout moment."
              : activeTab === "series"
              ? "Découvrez nos séries complètes et suivez votre avancée par épisode."
              : "Les chaînes, films et séries que vous regardez apparaîtront automatiquement ici."}
          </p>
          {!search && (
            <button
              className="history-empty-btn"
              onClick={() => {
                if (activeTab === "channels") changeView("live");
                else if (activeTab === "movies") changeView("movies");
                else if (activeTab === "series") changeView("series");
                else changeView("live");
              }}
            >
              {activeTab === "channels"
                ? "Accéder à la TV en direct"
                : activeTab === "movies"
                ? "Explorer le catalogue Films"
                : activeTab === "series"
                ? "Découvrir les Séries"
                : "Commencer à regarder"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SearchView({
  activeProfile,
  query,
  setQuery,
  resultsReal,
  searching,
  onSelectStream,
  onPlayMovie,
  onOpenDetail,
  onOpenSeriesDetail,
  demoResults,
  favorites,
  toggleFavorite,
  favoriteChannelIds,
  toggleFavoriteChannel,
}: {
  activeProfile: ActiveProfile;
  query: string;
  setQuery: (val: string) => void;
  resultsReal?: SearchResults | null;
  searching: boolean;
  onSelectStream: (stream: LiveStream) => void;
  onPlayMovie: (movie: VodMovie) => void;
  onOpenDetail?: (media: any) => void;
  onOpenSeriesDetail?: (series: SeriesItem) => void;
  demoResults?: any[];
  favorites: string[];
  toggleFavorite: (id: string) => void;
  favoriteChannelIds: string[];
  toggleFavoriteChannel: (stream: LiveStream) => void;
}) {
  const liveChannels = resultsReal?.results?.live || (activeProfile.isDemo ? (demoResults?.filter((r) => r.duration === "Direct") || []) : []);
  const movies = resultsReal?.results?.movies || (activeProfile.isDemo ? (demoResults?.filter((r) => r.type === "film" && r.duration !== "Direct") || []) : []);
  const seriesList = resultsReal?.results?.series || (activeProfile.isDemo ? (demoResults?.filter((r) => r.type === "série") || []) : []);
  const liveCount = liveChannels.length;
  const movieCount = movies.length;
  const seriesCount = seriesList.length;
  const totalResults = liveCount + movieCount + seriesCount;

  return (
    <div className="view-search" style={{ minHeight: "100vh", padding: "36px 44px 60px" }}>
      {/* Centered Modern Search Bar Pill */}
      <div className="search-pill-bar">
        <Search size={18} color="#7d8296" />
        <input
          type="text"
          className="search-pill-input"
          placeholder="Rechercher des films, séries, chaînes..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            style={{ background: "transparent", border: "none", color: "#64748b", cursor: "pointer" }}
            title="Effacer"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {searching && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: "#94a3b8", padding: 40 }}>
          <RefreshCw className="spin" size={20} />
          <span>Recherche en cours dans tout le catalogue...</span>
        </div>
      )}

      {!searching && !query.trim() && (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#64748b" }}>
          <Search size={44} style={{ opacity: 0.35, color: "#f4384f", margin: "0 auto 16px" }} />
          <h2 style={{ color: "#fff", fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
            Recherche globale dans tout le catalogue
          </h2>
          <p style={{ fontSize: 13, maxWidth: 500, margin: "0 auto 24px", color: "#94a3b8" }}>
            Recherchez instantanément parmi l'intégralité des chaînes TV en direct, films et séries disponibles.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", maxWidth: 600, margin: "0 auto" }}>
            {["TF1", "Canal+", "BeIN Sports", "RMC", "Action", "Comédie", "Avatar"].map((tag) => (
              <button
                key={tag}
                type="button"
                className="btn-glass"
                style={{ fontSize: 12, padding: "6px 14px", cursor: "pointer" }}
                onClick={() => setQuery(tag)}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}

      {!searching && query.trim() && totalResults === 0 && (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#64748b" }}>
          <Search size={40} style={{ opacity: 0.3, margin: "0 auto 14px" }} />
          <h3 style={{ color: "#fff", fontSize: 16 }}>Aucun résultat pour « {query} »</h3>
          <p style={{ fontSize: 13, marginTop: 4 }}>Vérifiez l'orthographe ou essayez d'autres mots-clés.</p>
        </div>
      )}

      {!searching && (
        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          {/* Channels Row */}
          {liveCount > 0 && (
            <section className="nyx-content-section" style={{ padding: 0 }}>
              <div className="nyx-section-head">
                <div className="nyx-section-title">Chaînes TV ({liveCount})</div>
              </div>
              <div className="nyx-scroll-row">
                {liveChannels.slice(0, 40).map((stream, idx) => {
                  const streamId = stream?.stream_id ?? `search-stream-${idx}`;
                  const streamName = String(stream?.name || "Chaîne");
                  const isFav = favoriteChannelIds.includes(String(streamId));
                  return (
                    <div
                      key={streamId}
                      className="channel-card"
                      style={{ flex: "0 0 160px", aspectRatio: "1.3 / 1" }}
                      onClick={() => onSelectStream(stream)}
                    >
                      <button
                        className="favorite-button"
                        style={{ position: "absolute", top: 8, right: 8 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavoriteChannel(stream);
                        }}
                        title={isFav ? "Retirer des favoris" : "Ajouter aux favoris"}
                      >
                        <Heart size={15} fill={isFav ? "#f4384f" : "none"} color={isFav ? "#f4384f" : "#cbd5e1"} />
                      </button>
                      <div className="channel-card-logo-box">
                        {stream?.stream_icon ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={stream.stream_icon} alt={streamName} />
                        ) : (
                          <div style={{ height: 44, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, color: "#64748b" }}>
                            {streamName.slice(0, 3).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <span className="channel-card-name">{streamName}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Movies Row */}
          {movieCount > 0 && (
            <section className="nyx-content-section" style={{ padding: 0 }}>
              <div className="nyx-section-head">
                <div className="nyx-section-title">Films ({movieCount})</div>
              </div>
              <div className="nyx-scroll-row">
                {movies.slice(0, 40).map((movie, idx) => {
                  const movieId = movie?.stream_id ?? `search-movie-${idx}`;
                  const movieName = String(movie?.name || movie?.title || "Film");
                  return (
                    <div
                      key={movieId}
                      className="nyx-card"
                      onClick={() => {
                        if (onOpenDetail) onOpenDetail(movie);
                        else onPlayMovie(movie);
                      }}
                    >
                      <span className="nyx-card-rating">★ {movie?.rating_5based || "7.5"}</span>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={movie?.stream_icon || movie?.poster || "/assets/avatar_card.jpg"} alt={movieName} />
                      <div className="nyx-card-title-overlay">{movieName}</div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Series Row */}
          {seriesCount > 0 && (
            <section className="nyx-content-section" style={{ padding: 0 }}>
              <div className="nyx-section-head">
                <div className="nyx-section-title">Séries ({seriesCount})</div>
              </div>
              <div className="nyx-scroll-row">
                {seriesList.slice(0, 40).map((ser, idx) => {
                  const serId = ser?.series_id ?? `search-ser-${idx}`;
                  const serName = String(ser?.name || ser?.title || "Série");
                  return (
                    <div
                      key={serId}
                      className="nyx-card"
                      onClick={() => {
                        if (onOpenDetail) onOpenDetail({ ...ser, kind: "series" });
                        else onOpenSeriesDetail?.(ser);
                      }}
                    >
                      <span className="nyx-card-rating">★ {ser?.rating || "8.0"}</span>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={ser?.cover || ser?.poster || "/assets/avatar_card.jpg"} alt={serName} />
                      <div className="nyx-card-title-overlay">{serName}</div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}


function SettingsView({
  activeProfile,
  onDisconnect,
  synced,
  refreshData,
  openProfile,
  showAdult,
  onToggleAdult,
}: {
  activeProfile: ActiveProfile;
  onDisconnect: () => void;
  synced: string;
  refreshData: () => void;
  openProfile: () => void;
  showAdult: boolean;
  onToggleAdult: (val: boolean) => void;
}) {
  return (
    <div className="settings-view">
      <div className="page-heading">
        <div>
          <p className="eyebrow">PRÉFÉRENCES</p>
          <h1>Paramètres</h1>
        </div>
      </div>

      {/* Compte IPTV */}
      <section className="settings-section">
        <h2>Compte IPTV</h2>
        <div className="settings-card profile-settings">
          <div className="server-icon"><Server size={24} /></div>
          <div className="profile-info">
            <strong>{activeProfile.name}</strong>
            <p>{activeProfile.server_url}</p>
            <span className="active-badge"><span /> {activeProfile.isDemo ? "Mode démo actif" : "Compte connecté"}</span>
          </div>
          <div className="server-stats">
            <span><small>Statut</small><strong>{activeProfile.status || "Actif"}</strong></span>
            <span><small>Connexions</small><strong>{activeProfile.isDemo ? "1 / 1" : "Actif"}</strong></span>
          </div>
          <div className="profile-actions">
            <button className="button button-ghost compact" onClick={openProfile}>Gérer</button>
            <button className="button button-ghost compact" onClick={onDisconnect} title="Changer de profil ou se déconnecter"><LogOut size={15} /> Déconnexion</button>
          </div>
        </div>
      </section>

      {/* Contrôle Parental */}
      <section className="settings-section">
        <h2>Contrôle Parental & Contenu Adulte (+18)</h2>
        <div className="settings-card settings-list" style={{ borderColor: showAdult ? "rgba(244, 63, 94, 0.3)" : undefined }}>
          <SettingRow
            icon={showAdult ? ShieldAlert : ShieldCheck}
            title="Afficher les chaînes et contenus pour adulte (+18)"
            text={
              showAdult
                ? "Activé : Les catégories 🔞 Adulte (+18) et leurs flux sont visibles (Directs, Films VOD, Séries)."
                : "Désactivé : Tout le contenu et les catégories pour adultes sont masqués dans l'application (directs, VOD, séries, recherche)."
            }
            control={
              <Switch
                checked={showAdult}
                onChange={onToggleAdult}
              />
            }
          />
        </div>
        <div className="parental-info-box" style={{ borderLeft: showAdult ? "3px solid #f43f5e" : "3px solid #34d399" }}>
          <div style={{ fontSize: 20, lineHeight: 1 }}>{showAdult ? "🔞" : "🛡️"}</div>
          <div>
            <strong>Information sur le contrôle parental :</strong><br />
            {showAdult
              ? "Le contenu adulte est actuellement affiché. En basculant l'interrupteur sur désactivé, toutes les catégories et chaînes adultes disparaîtront instantanément de vos directs, films et séries."
              : "Le contenu adulte est actuellement masqué. Aucune catégorie ni chaîne ou film pour adulte (+18) n'apparaît dans vos listes ni dans la recherche."}
          </div>
        </div>
      </section>

      {/* Lecture */}
      <section className="settings-section">
        <h2>Lecture</h2>
        <div className="settings-card settings-list">
          <SettingRow icon={Zap} title="Lecture automatique" text="Lancer le flux dès la sélection" control={<Switch initial />} />
          <SettingRow icon={Volume2} title="Volume par défaut" text="Mémoriser le dernier niveau" control={<Switch initial />} />
          <SettingRow icon={Subtitles} title="Sous-titres" text="Français, si disponibles" control={<ChevronRight size={18} style={{ color: "var(--muted)" }} />} />
          <SettingRow icon={Languages} title="Langue audio" text="Piste originale" control={<ChevronRight size={18} style={{ color: "var(--muted)" }} />} />
        </div>
      </section>

      {/* Données et catalogue */}
      <section className="settings-section">
        <h2>Données et catalogue</h2>
        <div className="settings-card settings-list">
          <SettingRow icon={RefreshCw} title="Actualiser le catalogue" text={`Dernière synchronisation : ${synced}`} control={<button className="button button-ghost compact" onClick={refreshData}><RefreshCw size={12} /> Actualiser</button>} />
          <SettingRow icon={Download} title="Cache des images" text="184 Mo utilisés" control={<button className="text-button danger">Vider</button>} />
          <SettingRow icon={History} title="Historique de lecture" text="Enregistré uniquement sur cet appareil" control={<button className="text-button danger">Effacer</button>} />
        </div>
      </section>

      <p className="legal-note"><ShieldCheck size={16} /> Fluxa est un lecteur multimédia. Aucun contenu, chaîne ou abonnement IPTV n'est fourni avec l'application.</p>
    </div>
  );
}

function SettingRow({ icon: Icon, title, text, control }: { icon: typeof Home; title: string; text: string; control: ReactNode }) {
  return (
    <div className="setting-row">
      <span className="setting-icon"><Icon size={20} /></span>
      <div className="setting-text">
        <strong className="setting-title">{title}</strong>
        <small className="setting-subtitle">{text}</small>
      </div>
      <div className="setting-control">{control}</div>
    </div>
  );
}

function Switch({ initial = false, checked, onChange }: { initial?: boolean; checked?: boolean; onChange?: (val: boolean) => void }) {
  const [active, setActive] = useState(initial);
  const isControlled = checked !== undefined;
  const isOn = isControlled ? checked : active;
  return (
    <button
      type="button"
      className={`switch-toggle ${isOn ? "on" : "off"}`}
      role="switch"
      aria-checked={isOn}
      onClick={() => {
        if (!isControlled) setActive(!active);
        onChange?.(!isOn);
      }}
      title={isOn ? "Désactiver" : "Activer"}
    >
      <span className="switch-slider" />
    </button>
  );
}
function EmptyState({ icon: Icon, title, text, action, onClick }: { icon: typeof Home; title: string; text: string; action?: string; onClick?: () => void }) { return <div className="empty-state"><span><Icon /></span><h2>{title}</h2><p>{text}</p>{action && <button className="button button-primary" onClick={onClick}>{action}</button>}</div>; }

function ProfileConnectScreen({
  onSelectProfile,
  onDemoLogin,
  setToast,
}: {
  onSelectProfile: (profile: ActiveProfile) => void;
  onDemoLogin: () => void;
  setToast: (msg: string) => void;
}) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeTab, setActiveTab] = useState<"profiles" | "add">("profiles");
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    async function checkSystem() {
      try {
        const health = await fluxaApi.health();
        setApiOnline(health.status === "ok");
      } catch {
        setApiOnline(false);
      }

      try {
        const list = await fluxaApi.profiles.list();
        setProfiles(list);
        if (list.length === 0) {
          setActiveTab("add");
        } else {
          setActiveTab("profiles");
        }
      } catch {
        setActiveTab("add");
      }
    }
    checkSystem();
  }, []);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "Maison").trim();
    const server_url = String(form.get("server_url") || "").trim();
    const username = String(form.get("username") || "").trim();
    const password = String(form.get("password") || "").trim();

    if (!isApiConfigured) {
      onDemoLogin();
      setToast("Mode démonstration activé");
      return;
    }

    setPending(true);
    try {
      const created = await fluxaApi.profiles.create({ name, server_url, username, password });
      setToast(`Connecté au profil « ${created.name} »`);
      onSelectProfile({
        id: created.id,
        name: created.name,
        server_url: created.server_url,
        username: created.username,
        status: created.status,
        expires_at: created.expires_at,
        isDemo: false,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "La connexion au serveur Xtream a échoué.");
    } finally {
      setPending(false);
    }
  }

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    try {
      await fluxaApi.profiles.remove(id);
      const remaining = profiles.filter((p) => p.id !== id);
      setProfiles(remaining);
      if (remaining.length === 0) setActiveTab("add");
      setToast("Profil supprimé");
    } catch {
      setToast("Erreur lors de la suppression du profil");
    }
  }

  return (
    <div className="connect-screen">
      <div className="connect-container">
        {/* En-tête de marque cinématique */}
        <header className="connect-brand-header">
          <div className="brand-glow-circle">
            <Tv size={34} color="#78adff" strokeWidth={2.2} />
          </div>
          <h1 className="connect-hero-title">Fluxa IPTV</h1>
          <p className="connect-hero-subtitle">Lecteur multimédia & passerelle de streaming haute performance</p>

          <div className="connect-status-badge">
            <span
              className="status-pulse"
              style={{
                background: apiOnline === true ? "#34d399" : apiOnline === false ? "#f43f5e" : "#fbbf24",
                boxShadow: apiOnline === true ? "0 0 10px rgba(52, 211, 153, 0.6)" : undefined,
              }}
            />
            <span>
              {apiOnline === null
                ? "Vérification du moteur local…"
                : apiOnline
                ? "Moteur local actif (FastAPI Port 8000)"
                : "Mode autonome (Backend hors-ligne)"}
            </span>
          </div>
        </header>

        {/* Boîte principale avec glassmorphism */}
        <div className="connect-card-box">
          {profiles.length > 0 && (
            <div className="connect-tabs">
              <button
                type="button"
                className={activeTab === "profiles" ? "active" : ""}
                onClick={() => setActiveTab("profiles")}
              >
                <User size={16} /> Profils enregistrés ({profiles.length})
              </button>
              <button
                type="button"
                className={activeTab === "add" ? "active" : ""}
                onClick={() => setActiveTab("add")}
              >
                <Plus size={16} /> Ajouter un compte Xtream
              </button>
            </div>
          )}

          {activeTab === "profiles" && profiles.length > 0 ? (
            <div className="existing-profiles">
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {profiles.map((p) => (
                  <div
                    key={p.id}
                    className="profile-select-item"
                    onClick={() => {
                      onSelectProfile({
                        id: p.id,
                        name: p.name,
                        server_url: p.server_url,
                        username: p.username,
                        status: p.status,
                        expires_at: p.expires_at,
                        isDemo: false,
                      });
                      setToast(`Connecté avec ${p.name}`);
                    }}
                  >
                    <div className="profile-item-main">
                      <span className="profile-item-avatar">
                        {p.name.slice(0, 2).toUpperCase()}
                      </span>
                      <div>
                        <strong>{p.name}</strong>
                        <small>{p.server_url.replace(/^https?:\/\//, "").split("/")[0]} · {p.username}</small>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span className="live-pill" style={{ background: "rgba(52, 211, 153, 0.15)", color: "#34d399", fontSize: 11 }}>
                        <span style={{ background: "#34d399", boxShadow: "0 0 6px #34d399" }} />
                        {p.status || "Actif"}
                      </span>
                      <button
                        type="button"
                        className="profile-delete-btn"
                        title="Supprimer ce profil"
                        onClick={(e) => handleDelete(e, p.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <button
                  type="button"
                  className="button button-ghost"
                  style={{ flex: 1, height: 42 }}
                  onClick={() => setActiveTab("add")}
                >
                  <Plus size={16} /> Nouveau compte Xtream
                </button>

                <button
                  type="button"
                  className="button button-ghost"
                  style={{ flex: 1, height: 42 }}
                  onClick={() => {
                    onDemoLogin();
                    setToast("Accès en mode démonstration");
                  }}
                >
                  <Sparkles size={16} style={{ color: "var(--accent)" }} /> Mode Démo
                </button>
              </div>
            </div>
          ) : (
            <form className="connect-form" onSubmit={handleCreate}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <h2 className="connect-section-title" style={{ margin: 0 }}>
                  <Server size={17} style={{ color: "var(--accent)" }} /> Identifiants Xtream Codes
                </h2>
                {profiles.length > 0 && (
                  <button
                    type="button"
                    className="text-button"
                    style={{ fontSize: 12 }}
                    onClick={() => setActiveTab("profiles")}
                  >
                    ← Retour aux profils
                  </button>
                )}
              </div>

              <label>
                Nom du profil
                <div className="input-icon-wrapper">
                  <User size={16} className="input-prefix-icon" />
                  <input name="name" placeholder="Ex: Maison, Salon, IPTV Premium" defaultValue="Maison" required />
                </div>
              </label>

              <label>
                URL du serveur Xtream
                <div className="input-icon-wrapper">
                  <Globe size={16} className="input-prefix-icon" />
                  <input name="server_url" type="url" placeholder="http://mon-serveur-iptv.com:8080" required />
                </div>
              </label>

              <div className="field-grid">
                <label>
                  Identifiant (Username)
                  <div className="input-icon-wrapper">
                    <User size={16} className="input-prefix-icon" />
                    <input name="username" placeholder="Identifiant IPTV" autoComplete="username" required />
                  </div>
                </label>

                <label>
                  Mot de passe
                  <div className="input-icon-wrapper">
                    <ShieldCheck size={16} className="input-prefix-icon" />
                    <input
                      name="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      required
                      style={{ paddingRight: 40 }}
                    />
                    <button
                      type="button"
                      className="password-toggle-btn"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label="Afficher le mot de passe"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </label>
              </div>

              {error && <p className="form-error">{error}</p>}

              <div className="connection-state">
                <ShieldCheck size={18} style={{ color: "#34d399", flexShrink: 0 }} />
                <div>
                  <strong>Sécurité & Confidentialité Locale</strong>
                  <small>Vos identifiants sont chiffrés dans SQLite local par le moteur FastAPI. Aucun partage externe.</small>
                </div>
              </div>

              <div className="connect-actions" style={{ marginTop: 8 }}>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={pending}
                  style={{ height: 44, fontSize: 14, fontWeight: 700 }}
                >
                  <RefreshCw className={pending ? "spin" : ""} size={18} />
                  {pending ? "Connexion & Synchronisation en cours…" : "Se connecter et synchroniser"}
                </button>

                <button
                  type="button"
                  className="button button-ghost"
                  style={{ height: 42 }}
                  onClick={() => {
                    onDemoLogin();
                    setToast("Accès en mode démonstration");
                  }}
                >
                  <Zap size={16} style={{ color: "var(--accent)" }} />
                  Accéder en mode démo (sans identifiants)
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="connect-footer-note">
          <ShieldCheck size={15} />
          Fluxa IPTV · Compatible Xtream Codes, M3U & Stalker · Décodage GPU accéléré
        </div>
      </div>
    </div>
  );
}

function SeriesDetailModal({
  series,
  activeProfile,
  onClose,
  onPlayEpisode,
}: {
  series: SeriesItem;
  activeProfile: ActiveProfile;
  onClose: () => void;
  onPlayEpisode: (series: SeriesItem, episode: any, seasonNum: string | number) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [seriesData, setSeriesData] = useState<any>(null);
  const [selectedSeason, setSelectedSeason] = useState<string>("1");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError("");

    if (activeProfile.isDemo) {
      setTimeout(() => {
        if (!isMounted) return;
        const mockEpisodes: Record<string, any[]> = {
          "1": [
            {
              id: "demo_ep_1",
              episode_num: 1,
              title: "Épisode 1 : Le Commencement",
              container_extension: "mp4",
              info: { duration_secs: 3300, plot: "Introduction captivante et immersion dans l'univers de la série." },
            },
            {
              id: "demo_ep_2",
              episode_num: 2,
              title: "Épisode 2 : L'Épreuve",
              container_extension: "mp4",
              info: { duration_secs: 3120, plot: "Les péripéties s'intensifient avec de nouveaux défis et révélations." },
            },
            {
              id: "demo_ep_3",
              episode_num: 3,
              title: "Épisode 3 : La Révélation",
              container_extension: "mp4",
              info: { duration_secs: 3450, plot: "Un dénouement spectaculaire pour clore ce premier arc narratif." },
            },
          ],
        };
        setSeriesData({
          info: {
            name: series.name,
            cover: series.cover,
            plot: series.plot || "Série télévisée disponible en haute définition.",
            rating_5based: series.rating,
            genre: series.genre,
            releaseDate: series.releaseDate,
          },
          episodes: mockEpisodes,
        });
        setSelectedSeason("1");
        setLoading(false);
      }, 250);
      return;
    }

    fluxaApi.series
      .detail(activeProfile.id, String(series.series_id))
      .then((data: any) => {
        if (!isMounted) return;
        setSeriesData(data);
        const epObj = data?.episodes;
        if (epObj && typeof epObj === "object") {
          const seasonKeys = Object.keys(epObj).sort((a, b) => Number(a) - Number(b));
          if (seasonKeys.length > 0) {
            setSelectedSeason(seasonKeys[0]);
          }
        }
      })
      .catch((err) => {
        console.error("Erreur chargement détails série:", err);
        if (isMounted) setError("Impossible de charger les épisodes de cette série.");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [series, activeProfile]);

  const info = seriesData?.info || {};
  const episodesMap = useMemo(() => seriesData?.episodes || {}, [seriesData?.episodes]);
  const seasonKeys = useMemo(() => {
    return Object.keys(episodesMap).sort((a, b) => Number(a) - Number(b));
  }, [episodesMap]);

  const currentEpisodes: any[] = episodesMap[selectedSeason] || [];

  return (
    <div
      className="modal-video-overlay"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="modal-series-card" onClick={(e) => e.stopPropagation()}>
        {/* En-tête Série Hero */}
        <div className="modal-series-hero">
          <div
            className="modal-series-backdrop"
            style={{
              backgroundImage: `url('${info.cover || series.cover || "/assets/hero.jpg"}')`,
            }}
          />
          <div className="modal-series-hero-content">
            <div className="modal-series-poster">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={info.cover || series.cover || "/assets/hero.jpg"}
                alt={info.name || series.name}
              />
            </div>
            <div className="modal-series-meta">
              <span className="modal-series-badge">SÉRIE TV</span>
              <h2>{info.name || series.name}</h2>
              <div className="modal-series-tags">
                {(info.rating_5based || series.rating) && (
                  <span className="tag-rating">★ {info.rating_5based || series.rating}</span>
                )}
                {(info.releaseDate || series.releaseDate) && (
                  <span>{info.releaseDate || series.releaseDate}</span>
                )}
                {(info.genre || series.genre) && (
                  <span>{info.genre || series.genre}</span>
                )}
                {seasonKeys.length > 0 && (
                  <span>
                    {seasonKeys.length} Saison{seasonKeys.length > 1 ? "s" : ""}
                  </span>
                )}
              </div>
              {(info.plot || series.plot) && (
                <p className="modal-series-plot">{info.plot || series.plot}</p>
              )}
              {info.cast && (
                <p className="modal-series-cast">
                  <strong>Distribution :</strong> {info.cast}
                </p>
              )}
            </div>
            <button
              className="modal-video-close"
              onClick={onClose}
              aria-label="Fermer"
              style={{ position: "relative", zIndex: 3 }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Corps : Onglets Saisons & Grille Épisodes */}
        <div className="modal-series-body">
          {loading ? (
            <div className="series-loading">
              <RefreshCw className="spin" size={24} />
              <span>Chargement des saisons et épisodes…</span>
            </div>
          ) : error ? (
            <div className="empty-compact" style={{ margin: "auto" }}>
              <p>{error}</p>
            </div>
          ) : (
            <>
              {/* Onglets Saisons */}
              {seasonKeys.length > 0 && (
                <div className="modal-season-tabs">
                  {seasonKeys.map((sNum) => {
                    const count = episodesMap[sNum]?.length || 0;
                    return (
                      <button
                        key={sNum}
                        className={selectedSeason === sNum ? "active" : ""}
                        onClick={() => setSelectedSeason(sNum)}
                      >
                        Saison {sNum}
                        <span className="season-count">({count})</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Grille Épisodes */}
              {currentEpisodes.length > 0 ? (
                <div className="modal-episodes-grid">
                  {currentEpisodes.map((ep: any, idx: number) => {
                    const epNum = ep.episode_num ?? idx + 1;
                    const epTitle = ep.title ? ep.title.trim() : `Épisode ${epNum}`;
                    const thumb = ep.info?.movie_image || info.cover || series.cover;
                    const durationSec = ep.info?.duration_secs;
                    const durationMin = durationSec ? Math.round(durationSec / 60) : null;

                    return (
                      <div
                        key={ep.id || idx}
                        className="episode-item"
                        onClick={() => {
                          onPlayEpisode(series, ep, selectedSeason);
                          onClose();
                        }}
                        title={`Lire ${epTitle}`}
                      >
                        <div className="episode-thumb">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={thumb} alt={epTitle} />
                          <div className="episode-play-overlay">
                            <Play size={32} fill="#fff" color="#fff" />
                          </div>
                          <span className="episode-num-badge">EP {epNum}</span>
                        </div>
                        <div className="episode-info">
                          <h4>{epTitle}</h4>
                          {durationMin ? (
                            <small style={{ color: "#60a5fa", fontSize: 11, fontWeight: 600 }}>
                              {durationMin} min
                            </small>
                          ) : null}
                          {ep.info?.plot && (
                            <p
                              style={{
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                              }}
                            >
                              {ep.info.plot}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-compact" style={{ margin: "auto" }}>
                  <p>Aucun épisode répertorié pour la Saison {selectedSeason}.</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ProfileDialog({ close, showPassword, setShowPassword, setToast }: { close: () => void; showPassword: boolean; setShowPassword: (value: boolean) => void; setToast: (value: string) => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    if (!isApiConfigured) {
      setToast("Profil enregistré en mode démonstration");
      close();
      return;
    }
    setPending(true);
    try {
      const profile = await fluxaApi.profiles.create({
        name: String(form.get("name")),
        server_url: String(form.get("server_url")),
        username: String(form.get("username")),
        password: String(form.get("password")),
      });
      window.localStorage.setItem("fluxa-profile-id", profile.id);
      setToast("Connexion Xtream validée et profil enregistré");
      close();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "La connexion a échoué.");
    } finally {
      setPending(false);
    }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={close}><section className="profile-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-title" onMouseDown={(event) => event.stopPropagation()}><div className="dialog-heading"><span className="server-icon"><Server /></span><div><p className="eyebrow">PROFIL XTREAM CODES</p><h2 id="profile-title">Gérer l'abonnement</h2></div><button className="icon-button" onClick={close} aria-label="Fermer"><X size={20} /></button></div><form onSubmit={submit}><label>Nom du profil<input name="name" defaultValue="Maison" required /></label><label>Adresse du serveur<input name="server_url" type="url" placeholder="http://serveur.com:8080" required /></label><div className="field-grid"><label>Nom d'utilisateur<input name="username" autoComplete="username" required /></label><label>Mot de passe<span className="password-field"><input name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label="Afficher le mot de passe">{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label></div>{error && <p className="form-error">{error}</p>}<div className="connection-state"><span><ShieldCheck size={17} /></span><div><strong>Connexion sécurisée</strong><small>Les identifiants sont testés puis chiffrés par le backend.</small></div></div><div className="dialog-actions"><button type="button" className="button button-ghost" onClick={close}>Annuler</button><button type="submit" className="button button-primary" disabled={pending}><RefreshCw className={pending ? "spin" : ""} size={17} /> {pending ? "Connexion…" : "Tester et enregistrer"}</button></div></form></section></div>;
}
