const configuredUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
const DEFAULT_CLOUD_API = "https://backend-3af4c6e8.fastapicloud.dev";

function getInitialApiUrl(): string {
  if (configuredUrl) return configuredUrl;
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host && host !== "localhost" && host !== "127.0.0.1") {
      return DEFAULT_CLOUD_API;
    }
  }
  return "http://127.0.0.1:8000";
}

export const apiBaseUrl = getInitialApiUrl().replace(/\/$/, "");
export const isApiConfigured = true;

type ApiErrorBody = { detail?: string };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      signal: init?.signal || controller.signal,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as ApiErrorBody;
      throw new Error(body.detail || `Erreur API (${response.status})`);
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  } finally {
    clearTimeout(timer);
  }
}

export type Profile = {
  id: string; name: string; server_url: string; username: string; status: string;
  expires_at: string | null; max_connections: number | null;
  active_connections: number | null; last_sync_at: string | null;
};

export type ProfileInput = { name: string; server_url: string; username: string; password: string };

export type LiveCategory = {
  category_id: string;
  category_name: string;
  parent_id: number;
};

export type LiveStream = {
  num?: number;
  name: string;
  stream_type: string;
  stream_id: number | string;
  stream_icon: string;
  epg_channel_id?: string;
  added?: string;
  category_id: string;
  custom_sid?: string;
  tv_archive?: number;
  tv_archive_duration?: number;
  direct_source?: string;
};

export type VodCategory = {
  category_id: string;
  category_name: string;
  parent_id: number;
};

export type VodMovie = {
  num?: number;
  name: string;
  stream_type: string;
  stream_id: number | string;
  stream_icon: string;
  rating?: string | number;
  rating_5based?: number | string;
  added?: string;
  category_id: string;
  container_extension?: string;
};

export type SeriesItem = {
  num?: number;
  name: string;
  series_id: number | string;
  cover: string;
  plot?: string;
  cast?: string;
  director?: string;
  genre?: string;
  releaseDate?: string;
  last_modified?: string;
  rating?: string | number;
  category_id: string;
};

export type SearchResults = {
  query: string;
  results: {
    live: LiveStream[];
    movies: VodMovie[];
    series: SeriesItem[];
  };
  total: number;
};

export type FavoriteItem = {
  id: number;
  profile_id: string;
  content_type: "live" | "movie" | "series";
  content_id: string;
  title: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export const fluxaApi = {
  health: () => request<{ status: string }>("/health"),
  profiles: {
    list: () => request<Profile[]>("/api/profiles"),
    create: (profile: ProfileInput) => request<Profile>("/api/profiles", { method: "POST", body: JSON.stringify(profile) }),
    remove: (id: string) => request<void>(`/api/profiles/${id}`, { method: "DELETE" }),
  },
  live: {
    categories: (profileId: string, includeAdult: boolean = true) =>
      request<LiveCategory[]>(`/api/live/categories?profile_id=${encodeURIComponent(profileId)}&include_adult=${includeAdult}`),
    streams: (profileId: string, categoryId?: string, includeAdult: boolean = true) => {
      const catParam = categoryId && categoryId !== "all" ? `&category_id=${encodeURIComponent(categoryId)}` : "";
      return request<LiveStream[]>(`/api/live/streams?profile_id=${encodeURIComponent(profileId)}${catParam}&include_adult=${includeAdult}`);
    },
    probeBatch: (profileId: string, streamIds: (string | number)[]) =>
      request<{ active_ids: string[] }>("/api/live/probe-batch", {
        method: "POST",
        body: JSON.stringify({ profile_id: profileId, stream_ids: streamIds }),
      }),
    activeChannels: {
      list: (profileId: string) =>
        request<LiveStream[]>(`/api/live/active-channels?profile_id=${encodeURIComponent(profileId)}`),
      save: (profileId: string, channels: LiveStream[]) =>
        request<{ status: string; saved: number }>("/api/live/active-channels", {
          method: "POST",
          body: JSON.stringify({ profile_id: profileId, channels }),
        }),
    },
  },
  vod: {
    categories: (profileId: string, includeAdult: boolean = true) =>
      request<VodCategory[]>(`/api/vod/categories?profile_id=${encodeURIComponent(profileId)}&include_adult=${includeAdult}`),
    movies: (profileId: string, categoryId?: string, includeAdult: boolean = true) => {
      const catParam = categoryId && categoryId !== "all" ? `&category_id=${encodeURIComponent(categoryId)}` : "";
      return request<VodMovie[]>(`/api/vod/movies?profile_id=${encodeURIComponent(profileId)}${catParam}&include_adult=${includeAdult}`);
    },
  },
  series: {
    categories: (profileId: string, includeAdult: boolean = true) =>
      request<VodCategory[]>(`/api/series/categories?profile_id=${encodeURIComponent(profileId)}&include_adult=${includeAdult}`),
    list: (profileId: string, categoryId?: string, includeAdult: boolean = true) => {
      const catParam = categoryId && categoryId !== "all" ? `&category_id=${encodeURIComponent(categoryId)}` : "";
      return request<SeriesItem[]>(`/api/series?profile_id=${encodeURIComponent(profileId)}${catParam}&include_adult=${includeAdult}`);
    },
    detail: (profileId: string, seriesId: string) => request<unknown>(`/api/series/${encodeURIComponent(seriesId)}?profile_id=${encodeURIComponent(profileId)}`),
  },
  epg: (profileId: string, streamId: string) => request<unknown>(`/api/epg/${encodeURIComponent(streamId)}?profile_id=${encodeURIComponent(profileId)}`),
  search: (profileId: string, query: string, contentType: "all" | "live" | "movie" | "series" = "all", includeAdult: boolean = true) =>
    request<SearchResults>(`/api/search?profile_id=${encodeURIComponent(profileId)}&q=${encodeURIComponent(query)}&content_type=${encodeURIComponent(contentType)}&include_adult=${includeAdult}`),
  refreshCatalog: (profileId: string) => request<{ status: string; last_sync_at: string }>(`/api/catalog/refresh?profile_id=${encodeURIComponent(profileId)}`, { method: "POST" }),
  favorites: {
    list: (profileId: string) => request<FavoriteItem[]>(`/api/favorites?profile_id=${encodeURIComponent(profileId)}`),
    add: (favorite: Record<string, unknown>) => request<FavoriteItem>("/api/favorites", { method: "POST", body: JSON.stringify(favorite) }),
    remove: (id: number) => request<void>(`/api/favorites/${id}`, { method: "DELETE" }),
    removeByContent: (profileId: string, contentType: string, contentId: string | number) =>
      request<void>(`/api/favorites?profile_id=${encodeURIComponent(profileId)}&content_type=${encodeURIComponent(contentType)}&content_id=${encodeURIComponent(String(contentId))}`, { method: "DELETE" }),
  },
  history: {
    list: (profileId: string) => request<unknown[]>(`/api/history?profile_id=${encodeURIComponent(profileId)}`),
    save: (entry: Record<string, unknown>) => request<unknown>("/api/history", { method: "POST", body: JSON.stringify(entry) }),
    clear: (profileId: string) => request<void>(`/api/history?profile_id=${encodeURIComponent(profileId)}`, { method: "DELETE" }),
  },
  streamUrl: (profileId: string, kind: "live" | "movie" | "series", streamId: string | number, extension?: string) =>
    `${apiBaseUrl}/api/stream/${encodeURIComponent(profileId)}/${kind}/${encodeURIComponent(streamId)}${extension ? `?extension=${encodeURIComponent(extension)}` : ""}`,
  timeshiftUrl: (profileId: string, streamId: string | number, start: string, durationMinutes: number = 60) =>
    `${apiBaseUrl}/api/timeshift/${encodeURIComponent(profileId)}/${encodeURIComponent(streamId)}?start=${encodeURIComponent(start)}&duration=${durationMinutes}`,
};
