// session.model.ts
export interface SessionResponse {
  session_id: string;
  token: string;
  expires_in: number;
}

// bus.model.ts
export interface Bus {
  ligne: string;
  mode: 'vu' | 'dedans';
  source?: string;
  tracking_mode?: 'live_gps';
  arret_signale: string;
  arret_estime: string;
  lat: number;
  lon: number;
  au_terminus: boolean;
  repart_dans_min: number | null;
  minutes_depuis_signalement: number;
  confiance: {
    niveau: 'vert' | 'jaune' | 'rouge';
    tone: 'success' | 'warning' | 'danger';
    icon: 'signal-live' | 'signal-estimated' | 'signal-stale';
    label: string;
  };
  confidence_level: 'low' | 'medium' | 'high';
  confidence_score: number;
  confidence_reason: string;
  confirmation_count: number;
  direction: 'aller' | 'retour' | null;
  direction_confidence: 'high' | 'low' | 'unknown';
  trace_progress: {
    source: string;
    direction: string;
    geometry_key?: string;
    progress_m: number;
    route_length_m: number;
    progress_ratio: number;
    projection_error_m: number | null;
    segment_index?: number;
  } | null;
  next_stops_eta: Array<{
    nom: string;
    lat: number | null;
    lon: number | null;
    idx: number;
    eta_sec: number;
    eta_min: number;
    quality: 'indicative';
  }>;
  eta_disabled_reason: 'service_reduit_nuit' | null;
}

// ws.model.ts
export interface WsWelcome {
  type: 'welcome';
  text: string;
  suggestions: string[];
  first_visit: boolean;
}

export interface WsChatResponse {
  type: 'chat_response';
  text: string;
}

export interface WsTyping {
  type: 'typing';
  active: boolean;
}

export interface WsStatus {
  type: 'status';
  text: string;
}

export interface WsReportAck {
  type: 'report_ack';
  success: boolean;
  id?: string;
  status?: 'recorded' | 'already_recorded';
  error?: string;
}

export interface WsError {
  type: 'error';
  message: string;
}

// route.model.ts
export interface DirectRoute {
  number: string;
  name: string;
  terminus_a: string;
  terminus_b: string;
  stops: string[];
  nb_stops: number;
  score: number;
}

export interface WalkDirectRoute {
  number: string;
  name: string;
  walk_stop: string;
  walk_dist_m: number;
  walk_min: number;
  stops: string[];
  nb_stops: number;
  walk_dest_m: number;
  walk_dest_min: number;
  total_min: number;
  score: number;
  zone: number;
}

export interface TransferRoute {
  number1: string;
  name1: string;
  stops1: string[];
  transfer: string;
  number2: string;
  name2: string;
  stops2: string[];
  nb_stops: number;
  total_min: number;
  score: number;
}

export interface RouteResponse {
  status: 'direct' | 'walk_direct' | 'transfer' | 'not_found' | 'stop_not_found' | 'same_stop' | 'no_transfer_not_found' | 'error';
  origin_display?: string;
  dest_display?: string;
  which?: 'origin' | 'dest';
  query?: string;
  stop?: string;
  message?: string;
  routes?: Array<DirectRoute | WalkDirectRoute | TransferRoute>;
  alt_transfer?: TransferRoute;
  alt_walk?: WalkDirectRoute;
}

// subscription.model.ts
export interface SubscriptionsResponse {
  lignes: string[];
  abonnements: Array<{
    ligne: string;
    arret: string;
    heure_alerte: string | null;
  }>;
}

// leaderboard.model.ts
export interface LeaderboardResponse {
  leaderboard: Array<{
    rang: number;
    pseudo: string;
    nb_signalements: number;
    fiabilite_score: number;
    badge: {
      emoji: string;
      label: string;
      niveau: number;
    };
    name: string;
    avatar: string;
    zone: string;
    count: number;
    badges: string[];
  }>;
  stats: {
    total_signalements_aujourd_hui: number;
    total_signalements_all_time: number;
    nb_contributeurs: number;
  };
  error?: string;
}

// report.model.ts
export interface ReportRequest {
  ligne: string;
  arret: string;
  observation?: string | null;
  mode?: 'vu' | 'dedans';
  source?: 'web_geoloc' | 'web_signal' | 'web_dashboard' | 'web_popup_confirm' | 'web_modal' | 'web_sheet';
  client_ts?: string | null;
  session_id?: string | null;
  lat?: number | null;
  lon?: number | null;
  nearest_stop?: string | null;
}

export type ReportResponse =
  | { id: string; status: 'recorded' }
  | { status: 'already_recorded' };

// stops.model.ts
export interface StopsSearchResponse {
  stops: Array<{
    nom: string;
    lat: number | null;
    lon: number | null;
    distance_m: number | null;
    lignes: Array<{
      numero: string;
      has_recent: boolean;
      last_seen_min: number | null;
    }>;
  }>;
  total: number;
  query: string;
  via_secteur?: string;
}

// Local bundled assets (src/assets/data) — Itinéraire local index enrichment (Étape 3b)
export interface XetuMvpData {
  lignes: Record<string, {
    numero?: string;
    nom?: string;
    terminus_a?: string;
    terminus_b?: string;
    arrets?: Array<{ nom: string; lat: number; lon: number; aliases_terrain?: string[] }>;
    arrets_retour?: Array<{ nom: string; lat: number; lon: number; aliases_terrain?: string[] }>;
  }>;
}

export interface SecteursDakarData {
  secteurs_dakar: Array<{
    nom_officiel: string;
    commune: string;
    coordonnees?: { latitude: number; longitude: number };
    parametres_transport?: { zone_hub_majeur?: boolean };
    points_repere?: string[];
  }>;
}

export interface NearbyResponse {
  status: 'success' | 'empty';
  message: string;
  stops: Array<{
    nom: string;
    distance_m: number;
    lignes: string[];
  }>;
}

// Chat UI message model
export interface ChatMessage {
  role: 'user' | 'bot';
  text: string;
  time: string;
}
