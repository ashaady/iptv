"use client";

/* eslint-disable react/no-unescaped-entities */

import {
  Bell, Check, ChevronDown, ChevronRight, CircleHelp, Clapperboard,
  Download, Expand, Eye, EyeOff, Film, Heart, History, Home, Languages,
  ListFilter, Menu, MoreHorizontal, Pause, PictureInPicture, Play, Radio,
  RefreshCw, RotateCcw, Search, Server, Settings, ShieldCheck,
  SlidersHorizontal, Subtitles, Tv, Volume2, X, Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";

type View = "home" | "live" | "movies" | "series" | "favorites" | "history" | "search" | "settings";
type MediaType = "film" | "série";

type Media = {
  id: string; title: string; type: MediaType; year: number; genre: string;
  rating: number; duration: string; progress?: number; episode?: string;
  palette: string; monogram: string;
};

type Channel = {
  id: string; name: string; group: string; logo: string; color: string;
  now: string; next: string; time: string; progress: number;
};

const navItems: { id: View; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Accueil", icon: Home },
  { id: "live", label: "TV en direct", icon: Tv },
  { id: "movies", label: "Films", icon: Film },
  { id: "series", label: "Séries", icon: Clapperboard },
  { id: "favorites", label: "Favoris", icon: Heart },
  { id: "history", label: "Historique", icon: History },
];

const media: Media[] = [
  { id: "m1", title: "Sous le baobab", type: "film", year: 2025, genre: "Drame", rating: 8.7, duration: "1 h 48", progress: 62, palette: "sunset", monogram: "SB" },
  { id: "m2", title: "Dakar, minuit", type: "série", year: 2026, genre: "Thriller", rating: 9.1, duration: "8 épisodes", progress: 34, episode: "S1 · E3", palette: "violet", monogram: "DM" },
  { id: "m3", title: "Ligne d'horizon", type: "film", year: 2024, genre: "Aventure", rating: 8.2, duration: "2 h 06", palette: "ocean", monogram: "LH" },
  { id: "m4", title: "Quartier libre", type: "série", year: 2025, genre: "Comédie", rating: 7.9, duration: "12 épisodes", palette: "lime", monogram: "QL" },
  { id: "m5", title: "Le dernier signal", type: "film", year: 2026, genre: "Science-fiction", rating: 8.5, duration: "1 h 56", progress: 18, palette: "ember", monogram: "DS" },
  { id: "m6", title: "Terres salées", type: "film", year: 2023, genre: "Documentaire", rating: 8.8, duration: "1 h 31", palette: "sand", monogram: "TS" },
  { id: "m7", title: "La chambre 17", type: "série", year: 2026, genre: "Mystère", rating: 8.4, duration: "6 épisodes", palette: "rose", monogram: "C17" },
  { id: "m8", title: "Cap au nord", type: "film", year: 2025, genre: "Action", rating: 7.8, duration: "2 h 12", palette: "steel", monogram: "CN" },
  { id: "m9", title: "Les héritières", type: "série", year: 2024, genre: "Drame", rating: 8.9, duration: "16 épisodes", palette: "gold", monogram: "LH" },
  { id: "m10", title: "Respire", type: "film", year: 2026, genre: "Romance", rating: 8.0, duration: "1 h 43", palette: "aqua", monogram: "RE" },
];

const channels: Channel[] = [
  { id: "c1", name: "Sunu Info", group: "Sénégal", logo: "SI", color: "#d9ff52", now: "Le journal de 20 h", next: "Décryptage", time: "20:00 – 20:45", progress: 68 },
  { id: "c2", name: "Teranga Sport", group: "Sport", logo: "TS", color: "#ff6b57", now: "Derby de la capitale", next: "L'après-match", time: "19:30 – 21:30", progress: 44 },
  { id: "c3", name: "Ciné Horizon", group: "Cinéma", logo: "CH", color: "#8f7cff", now: "Ligne d'horizon", next: "La chambre 17", time: "20:05 – 22:10", progress: 27 },
  { id: "c4", name: "Planète Doc", group: "Documentaire", logo: "PD", color: "#50d8b1", now: "Océans d'Afrique", next: "Terres salées", time: "20:15 – 21:10", progress: 51 },
  { id: "c5", name: "Melo TV", group: "Musique", logo: "MT", color: "#ff78ba", now: "Session acoustique", next: "Le top 20", time: "20:00 – 21:00", progress: 73 },
  { id: "c6", name: "Kids +", group: "Jeunesse", logo: "K+", color: "#55b7ff", now: "Les explorateurs", next: "Mini labo", time: "20:25 – 20:50", progress: 19 },
];

const categories = ["Toutes", "Sénégal", "Sport", "Cinéma", "Information", "Documentaire", "Jeunesse", "Musique"];

function MediaArtwork({ item, wide = false }: { item: Media; wide?: boolean }) {
  return <div className={`artwork artwork-${item.palette} ${wide ? "artwork-wide" : ""}`} aria-hidden="true"><span className="artwork-orbit" /><span className="artwork-monogram">{item.monogram}</span><span className="artwork-grain" /></div>;
}

function Brand() {
  return <div className="brand" aria-label="Fluxa"><span className="brand-mark"><span /></span><span>fluxa</span></div>;
}

export function IptvApp() {
  const [view, setView] = useState<View>("home");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Toutes");
  const [selectedChannel, setSelectedChannel] = useState(channels[1]);
  const [isPlaying, setIsPlaying] = useState(true);
  const [favorites, setFavorites] = useState<string[]>(() => {
    if (typeof window === "undefined") return ["m2", "m6", "c2"];
    const saved = window.localStorage.getItem("fluxa-favorites");
    return saved ? JSON.parse(saved) : ["m2", "m6", "c2"];
  });
  const [profileOpen, setProfileOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [toast, setToast] = useState("");
  const [synced, setSynced] = useState("Aujourd'hui, 20:42");

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

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
  function toggleFavorite(id: string) {
    setFavorites((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      window.localStorage.setItem("fluxa-favorites", JSON.stringify(next));
      return next;
    });
    setToast(favorites.includes(id) ? "Retiré des favoris" : "Ajouté aux favoris");
  }
  function refreshData() { setSynced("À l'instant"); setToast("Catalogue actualisé"); }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <div className="sidebar-top"><Brand /><button className="icon-button mobile-close" onClick={() => setMobileMenu(false)} aria-label="Fermer le menu"><X size={20} /></button></div>
        <nav className="primary-nav" aria-label="Navigation principale">
          {navItems.map((item) => { const Icon = item.icon; return <button key={item.id} className={view === item.id ? "nav-item active" : "nav-item"} onClick={() => changeView(item.id)}><Icon size={19} strokeWidth={2} /><span>{item.label}</span></button>; })}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-note"><span className="status-pulse" /><div><strong>Serveur connecté</strong><small>22 ms · Flux stable</small></div></div>
        <button className={view === "settings" ? "nav-item active" : "nav-item"} onClick={() => changeView("settings")}><Settings size={19} /><span>Paramètres</span></button>
        <button className="profile-card" onClick={() => setProfileOpen(true)}><span className="avatar">AB</span><span className="profile-copy"><strong>Maison</strong><small>Actif jusqu'au 18 déc.</small></span><MoreHorizontal size={18} /></button>
      </aside>
      {mobileMenu && <button className="backdrop" aria-label="Fermer le menu" onClick={() => setMobileMenu(false)} />}

      <main className="main-area">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setMobileMenu(true)} aria-label="Ouvrir le menu"><Menu size={21} /></button>
          <div className="mobile-brand"><Brand /></div>
          <button className="search-trigger" onClick={() => changeView("search")}><Search size={18} /><span>Rechercher une chaîne, un film, une série…</span><kbd>⌘ K</kbd></button>
          <div className="topbar-actions"><button className="icon-button" aria-label="Notifications"><Bell size={19} /><span className="notification-dot" /></button><button className="sync-button" onClick={refreshData}><RefreshCw size={17} /><span>{synced}</span></button></div>
        </header>
        <div className="content-area">
          {view === "home" && <HomeView changeView={changeView} favorites={favorites} toggleFavorite={toggleFavorite} />}
          {view === "live" && <LiveView category={category} setCategory={setCategory} channels={filteredChannels} selected={selectedChannel} select={setSelectedChannel} isPlaying={isPlaying} setIsPlaying={setIsPlaying} favorites={favorites} toggleFavorite={toggleFavorite} />}
          {(view === "movies" || view === "series") && <CatalogView type={view === "movies" ? "film" : "série"} favorites={favorites} toggleFavorite={toggleFavorite} />}
          {view === "favorites" && <FavoritesView favorites={favorites} toggleFavorite={toggleFavorite} changeView={changeView} />}
          {view === "history" && <HistoryView />}
          {view === "search" && <SearchView query={query} setQuery={setQuery} results={searchResults} favorites={favorites} toggleFavorite={toggleFavorite} />}
          {view === "settings" && <SettingsView synced={synced} refreshData={refreshData} openProfile={() => setProfileOpen(true)} />}
        </div>
      </main>

      <nav className="mobile-nav" aria-label="Navigation mobile">
        {navItems.slice(0, 4).map((item) => { const Icon = item.icon; return <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => changeView(item.id)}><Icon size={20} /><span>{item.label.replace("TV en direct", "Direct")}</span></button>; })}
        <button className={view === "search" ? "active" : ""} onClick={() => changeView("search")}><Search size={20} /><span>Recherche</span></button>
      </nav>
      {profileOpen && <ProfileDialog close={() => setProfileOpen(false)} showPassword={showPassword} setShowPassword={setShowPassword} setToast={setToast} />}
      {toast && <div className="toast"><Check size={17} />{toast}</div>}
    </div>
  );
}

function HomeView({ changeView, favorites, toggleFavorite }: { changeView: (view: View) => void; favorites: string[]; toggleFavorite: (id: string) => void }) {
  return <div className="view-stack">
    <section className="welcome-row"><div><p className="eyebrow">MARDI 8 SEPTEMBRE</p><h1>Bonsoir, Abdou.</h1><p>Qu'est-ce qu'on regarde ce soir ?</p></div><div className="account-chip"><span className="status-pulse" /><span><small>Abonnement actif</small><strong>101 jours restants</strong></span><ChevronRight size={18} /></div></section>
    <section className="hero-card"><div className="hero-atmosphere" /><div className="hero-content"><div className="live-pill"><span /> EN DIRECT</div><p className="hero-channel">TERANGA SPORT</p><h2>Derby de la capitale</h2><p className="hero-description">Suivez la rencontre en direct, puis retrouvez l'analyse et les réactions d'après-match.</p><div className="hero-meta"><span>Sport</span><span>HD</span><span>19:30 – 21:30</span></div><div className="hero-actions"><button className="button button-primary" onClick={() => changeView("live")}><Play size={18} fill="currentColor" /> Regarder</button><button className="button button-ghost"><CircleHelp size={18} /> Programme</button></div></div><div className="hero-score" aria-hidden="true"><span>DAK</span><strong>2</strong><i>:</i><strong>1</strong><span>RUF</span></div></section>
    <section className="quick-grid"><button className="quick-card live" onClick={() => changeView("live")}><span className="quick-icon"><Tv /></span><span><strong>TV en direct</strong><small>248 chaînes</small></span><ChevronRight /></button><button className="quick-card movies" onClick={() => changeView("movies")}><span className="quick-icon"><Film /></span><span><strong>Films</strong><small>3 842 titres</small></span><ChevronRight /></button><button className="quick-card series" onClick={() => changeView("series")}><span className="quick-icon"><Clapperboard /></span><span><strong>Séries</strong><small>1 207 séries</small></span><ChevronRight /></button></section>
    <MediaRow title="Continuer à regarder" subtitle="Reprenez là où vous vous êtes arrêté" items={media.filter((item) => item.progress)} favorites={favorites} toggleFavorite={toggleFavorite} />
    <MediaRow title="Tendances cette semaine" subtitle="Les titres les plus regardés" items={media.slice(2, 8)} favorites={favorites} toggleFavorite={toggleFavorite} />
  </div>;
}

function MediaRow({ title, subtitle, items, favorites, toggleFavorite }: { title: string; subtitle?: string; items: Media[]; favorites: string[]; toggleFavorite: (id: string) => void }) {
  return <section className="media-section"><div className="section-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="text-button">Tout afficher <ChevronRight size={16} /></button></div><div className="media-row">{items.map((item) => <MediaCard key={item.id} item={item} favorite={favorites.includes(item.id)} toggleFavorite={toggleFavorite} />)}</div></section>;
}

function MediaCard({ item, favorite, toggleFavorite }: { item: Media; favorite: boolean; toggleFavorite: (id: string) => void }) {
  return <article className="media-card"><div className="media-art"><MediaArtwork item={item} /><span className="rating">★ {item.rating}</span><button className={`favorite-button ${favorite ? "selected" : ""}`} onClick={() => toggleFavorite(item.id)} aria-label={favorite ? "Retirer des favoris" : "Ajouter aux favoris"}><Heart size={17} fill={favorite ? "currentColor" : "none"} /></button><button className="card-play" aria-label={`Lire ${item.title}`}><Play size={21} fill="currentColor" /></button>{item.progress && <span className="card-progress"><i style={{ width: `${item.progress}%` }} /></span>}</div><h3>{item.title}</h3><p>{item.episode ? `${item.episode} · ` : ""}{item.year} · {item.genre}</p></article>;
}

function LiveView({ category, setCategory, channels: list, selected, select, isPlaying, setIsPlaying, favorites, toggleFavorite }: { category: string; setCategory: (value: string) => void; channels: Channel[]; selected: Channel; select: (channel: Channel) => void; isPlaying: boolean; setIsPlaying: (value: boolean) => void; favorites: string[]; toggleFavorite: (id: string) => void }) {
  return <div className="live-view"><div className="page-heading"><div><p className="eyebrow">248 CHAÎNES DISPONIBLES</p><h1>TV en direct</h1></div><button className="button button-ghost compact"><ListFilter size={17} /> Trier</button></div><div className="live-layout">
    <aside className="category-panel"><h2>Catégories</h2>{categories.map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}><span>{item}</span><small>{item === "Toutes" ? 248 : 12 + item.length * 3}</small></button>)}</aside>
    <section className="channel-panel"><div className="panel-search"><Search size={17} /><input placeholder="Filtrer les chaînes" /></div><div className="channel-list">{list.length ? list.map((channel) => <button key={channel.id} className={selected.id === channel.id ? "channel-row selected" : "channel-row"} onClick={() => select(channel)}><span className="channel-logo" style={{ background: channel.color, color: "#090b0f" }}>{channel.logo}</span><span className="channel-copy"><strong>{channel.name}</strong><small>{channel.now}</small><i><b style={{ width: `${channel.progress}%` }} /></i></span><Heart className={favorites.includes(channel.id) ? "is-favorite" : ""} size={17} fill={favorites.includes(channel.id) ? "currentColor" : "none"} onClick={(event) => { event.stopPropagation(); toggleFavorite(channel.id); }} /></button>) : <div className="empty-compact">Aucune chaîne dans cette catégorie.</div>}</div></section>
    <section className="player-panel"><div className={`video-stage ${isPlaying ? "playing" : "paused"}`}><div className="video-signal"><Radio size={28} /><span>{selected.logo}</span></div><div className="video-vignette" />{!isPlaying && <button className="big-play" onClick={() => setIsPlaying(true)}><Play fill="currentColor" /></button>}<div className="video-top"><span className="live-pill"><span /> DIRECT</span><span>1080p</span></div><div className="video-controls"><button onClick={() => setIsPlaying(!isPlaying)} aria-label={isPlaying ? "Pause" : "Lecture"}>{isPlaying ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}</button><Volume2 /><span className="volume-track"><i /></span><span className="controls-spacer" /><PictureInPicture /><Expand /></div></div><div className="now-playing"><div className="now-header"><span><small>EN CE MOMENT SUR</small><strong>{selected.name}</strong></span><button className={`favorite-button static ${favorites.includes(selected.id) ? "selected" : ""}`} onClick={() => toggleFavorite(selected.id)}><Heart size={18} fill={favorites.includes(selected.id) ? "currentColor" : "none"} /></button></div><h2>{selected.now}</h2><p>{selected.time}</p><div className="epg-progress"><i style={{ width: `${selected.progress}%` }} /></div><div className="epg-next"><span><small>À SUIVRE</small><strong>{selected.next}</strong></span><span>21:30</span></div></div></section>
  </div></div>;
}

function CatalogView({ type, favorites, toggleFavorite }: { type: MediaType; favorites: string[]; toggleFavorite: (id: string) => void }) {
  const items = media.filter((item) => item.type === type);
  return <div className="view-stack"><div className="page-heading"><div><p className="eyebrow">CATALOGUE</p><h1>{type === "film" ? "Films" : "Séries"}</h1><p>{type === "film" ? "3 842 films disponibles" : "1 207 séries disponibles"}</p></div><div className="heading-actions"><button className="button button-ghost compact"><SlidersHorizontal size={17} /> Filtres</button><button className="button button-ghost compact">Populaires <ChevronDown size={16} /></button></div></div><div className="genre-pills">{["Tous", "Action", "Drame", "Comédie", "Thriller", "Documentaire", "Jeunesse"].map((genre, index) => <button className={index === 0 ? "active" : ""} key={genre}>{genre}</button>)}</div><section className="catalog-grid">{[...items, ...items].map((item, index) => <MediaCard key={`${item.id}-${index}`} item={item} favorite={favorites.includes(item.id)} toggleFavorite={toggleFavorite} />)}</section></div>;
}

function FavoritesView({ favorites, toggleFavorite, changeView }: { favorites: string[]; toggleFavorite: (id: string) => void; changeView: (view: View) => void }) {
  const favoriteMedia = media.filter((item) => favorites.includes(item.id)); const favoriteChannels = channels.filter((item) => favorites.includes(item.id));
  return <div className="view-stack"><div className="page-heading"><div><p className="eyebrow">VOTRE SÉLECTION</p><h1>Mes favoris</h1><p>{favoriteMedia.length + favoriteChannels.length} éléments enregistrés</p></div></div>{favoriteChannels.length > 0 && <section className="media-section"><div className="section-heading"><div><h2>Chaînes</h2></div></div><div className="favorite-channels">{favoriteChannels.map((channel) => <button key={channel.id} onClick={() => changeView("live")}><span className="channel-logo" style={{ background: channel.color, color: "#090b0f" }}>{channel.logo}</span><span><strong>{channel.name}</strong><small>{channel.now}</small></span><Play size={18} fill="currentColor" /></button>)}</div></section>}{favoriteMedia.length > 0 ? <MediaRow title="Films et séries" items={favoriteMedia} favorites={favorites} toggleFavorite={toggleFavorite} /> : <EmptyState icon={Heart} title="Aucun favori pour le moment" text="Ajoutez vos chaînes, films et séries pour les retrouver ici." action="Explorer les films" onClick={() => changeView("movies")} />}</div>;
}

function HistoryView() {
  const recent = media.filter((item) => item.progress);
  return <div className="view-stack"><div className="page-heading"><div><p className="eyebrow">ACTIVITÉ</p><h1>Historique</h1><p>Vos dernières lectures, sur cet appareil</p></div><button className="button button-ghost compact"><X size={16} /> Effacer</button></div><div className="history-list">{recent.map((item, index) => <article className="history-item" key={item.id}><MediaArtwork item={item} wide /><div className="history-copy"><span>{item.type === "film" ? "FILM" : item.episode}</span><h2>{item.title}</h2><p>Regardé {index === 0 ? "hier à 22:14" : `${index + 2} jours plus tôt`} · {item.duration}</p><div className="history-progress"><i style={{ width: `${item.progress}%` }} /></div></div><button className="button button-ghost compact"><RotateCcw size={16} /> Reprendre</button><button className="icon-button"><MoreHorizontal size={18} /></button></article>)}</div></div>;
}

function SearchView({ query, setQuery, results, favorites, toggleFavorite }: { query: string; setQuery: (value: string) => void; results: (Media | Channel)[]; favorites: string[]; toggleFavorite: (id: string) => void }) {
  return <div className="search-view"><div className="page-heading"><div><p className="eyebrow">RECHERCHE GLOBALE</p><h1>Que voulez-vous regarder ?</h1></div></div><label className="large-search"><Search size={22} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Chaîne, film, série, genre…" />{query && <button onClick={() => setQuery("")}><X size={19} /></button>}</label><div className="genre-pills"><button className="active">Tout</button><button>Chaînes</button><button>Films</button><button>Séries</button></div><p className="results-count">{query ? `${results.length} résultat${results.length !== 1 ? "s" : ""} pour « ${query} »` : "Suggestions pour vous"}</p><div className="search-results">{results.map((result) => "type" in result ? <MediaCard key={result.id} item={result} favorite={favorites.includes(result.id)} toggleFavorite={toggleFavorite} /> : <article className="search-channel" key={result.id}><span className="channel-logo" style={{ background: result.color, color: "#090b0f" }}>{result.logo}</span><div><strong>{result.name}</strong><small>{result.group} · {result.now}</small></div><button className="card-play static"><Play size={18} fill="currentColor" /></button></article>)}{results.length === 0 && <EmptyState icon={Search} title="Aucun résultat" text="Essayez un autre titre, genre ou nom de chaîne." />}</div></div>;
}

function SettingsView({ synced, refreshData, openProfile }: { synced: string; refreshData: () => void; openProfile: () => void }) {
  return <div className="settings-view"><div className="page-heading"><div><p className="eyebrow">PRÉFÉRENCES</p><h1>Paramètres</h1></div></div><section className="settings-section"><h2>Compte IPTV</h2><div className="settings-card profile-settings"><div className="server-icon"><Server /></div><div><strong>Maison</strong><p>https://stream.exemple.net:8080</p><span className="active-badge"><span /> Compte actif</span></div><div className="server-stats"><span><small>Expiration</small><strong>18 déc. 2026</strong></span><span><small>Connexions</small><strong>1 / 2</strong></span></div><button className="button button-ghost compact" onClick={openProfile}>Gérer</button></div></section><section className="settings-section"><h2>Lecture</h2><div className="settings-card settings-list"><SettingRow icon={Zap} title="Lecture automatique" text="Lancer le flux dès la sélection" control={<Switch initial />} /><SettingRow icon={Volume2} title="Volume par défaut" text="Mémoriser le dernier niveau" control={<Switch initial />} /><SettingRow icon={Subtitles} title="Sous-titres" text="Français, si disponibles" control={<ChevronRight />} /><SettingRow icon={Languages} title="Langue audio" text="Piste originale" control={<ChevronRight />} /></div></section><section className="settings-section"><h2>Données et catalogue</h2><div className="settings-card settings-list"><SettingRow icon={RefreshCw} title="Actualiser le catalogue" text={`Dernière synchronisation : ${synced}`} control={<button className="button button-ghost compact" onClick={refreshData}>Actualiser</button>} /><SettingRow icon={Download} title="Cache des images" text="184 Mo utilisés" control={<button className="text-button danger">Vider</button>} /><SettingRow icon={History} title="Historique de lecture" text="Enregistré uniquement sur cet appareil" control={<button className="text-button danger">Effacer</button>} /></div></section><p className="legal-note"><ShieldCheck size={16} /> Fluxa est un lecteur multimédia. Aucun contenu, chaîne ou abonnement IPTV n'est fourni avec l'application.</p></div>;
}

function SettingRow({ icon: Icon, title, text, control }: { icon: typeof Home; title: string; text: string; control: ReactNode }) { return <div className="setting-row"><span className="setting-icon"><Icon size={20} /></span><span><strong>{title}</strong><small>{text}</small></span><span className="setting-control">{control}</span></div>; }
function Switch({ initial = false }: { initial?: boolean }) { const [active, setActive] = useState(initial); return <button className={`switch ${active ? "on" : ""}`} role="switch" aria-checked={active} onClick={() => setActive(!active)}><span /></button>; }
function EmptyState({ icon: Icon, title, text, action, onClick }: { icon: typeof Home; title: string; text: string; action?: string; onClick?: () => void }) { return <div className="empty-state"><span><Icon /></span><h2>{title}</h2><p>{text}</p>{action && <button className="button button-primary" onClick={onClick}>{action}</button>}</div>; }

function ProfileDialog({ close, showPassword, setShowPassword, setToast }: { close: () => void; showPassword: boolean; setShowPassword: (value: boolean) => void; setToast: (value: string) => void }) {
  function submit(event: FormEvent) { event.preventDefault(); setToast("Connexion testée avec succès"); close(); }
  return <div className="modal-backdrop" role="presentation" onMouseDown={close}><section className="profile-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-title" onMouseDown={(event) => event.stopPropagation()}><div className="dialog-heading"><span className="server-icon"><Server /></span><div><p className="eyebrow">PROFIL XTREAM CODES</p><h2 id="profile-title">Gérer l'abonnement</h2></div><button className="icon-button" onClick={close} aria-label="Fermer"><X size={20} /></button></div><form onSubmit={submit}><label>Nom du profil<input defaultValue="Maison" /></label><label>Adresse du serveur<input defaultValue="https://stream.exemple.net:8080" /></label><div className="field-grid"><label>Nom d'utilisateur<input defaultValue="abdou_tv" /></label><label>Mot de passe<span className="password-field"><input type={showPassword ? "text" : "password"} defaultValue="fluxa2026" /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label="Afficher le mot de passe">{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label></div><div className="connection-state"><span><Check size={17} /></span><div><strong>Connexion opérationnelle</strong><small>Compte actif · 1 connexion sur 2 utilisée</small></div></div><div className="dialog-actions"><button type="button" className="button button-ghost" onClick={close}>Annuler</button><button type="submit" className="button button-primary"><RefreshCw size={17} /> Tester et enregistrer</button></div></form></section></div>;
}
