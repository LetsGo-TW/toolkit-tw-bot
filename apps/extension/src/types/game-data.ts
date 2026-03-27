// apps/extension/src/types/game-data.ts

/** Muitos campos do TW vêm como "número em string" */
export type Intish = number | `${number}`;

/** Unidades conhecidas (pode estender se surgir algo novo) */
export type UnitName =
  | "spear" | "sword" | "axe" | "archer"
  | "spy" | "light" | "marcher" | "heavy"
  | "ram" | "catapult" | "knight" | "snob"
  | "militia" | string; // fallback

export interface PlayerInfo {
  id: number;
  name: string;
  ally?: Intish;
  ally_level?: Intish;
  ally_member_count?: Intish;

  sitter?: Intish;
  sitter_type?: "normal" | string;

  sleep_start?: Intish;
  sleep_end?: Intish;
  sleep_last?: Intish;

  email_valid?: Intish;

  villages?: Intish;
  incomings?: Intish;
  supports?: Intish;

  knight_location?: Intish;
  knight_unit?: Intish;

  rank: number;
  points: Intish;

  date_started?: Intish;
  is_guest?: Intish;

  confirmation_skipping_hash?: Intish;
  quest_progress?: Intish;

  points_formatted?: string;
  rank_formatted?: string;

  pp?: Intish;

  new_ally_application?: Intish;
  new_ally_invite?: Intish;
  new_buddy_request?: Intish;
  new_daily_bonus?: Intish;
  new_forum_post?: Intish;
  new_post_notification?: number;
  new_igm?: Intish;
  new_items?: Intish;
  new_report?: Intish;
  new_quest?: Intish;

  // Campos extras possíveis
  [k: string]: unknown;
}

export interface QuestInfo {
  use_questlines: boolean;
}

export interface FeatureToggle {
  possible: boolean;
  active: boolean;
}

export type FeaturesMap = Record<string, FeatureToggle>;

export type VillageBuildings = Partial<Record<
  | "main" | "barracks" | "stable" | "garage" | "church" | "church_f"
  | "watchtower" | "snob" | "smith" | "place" | "statue" | "market"
  | "wood" | "stone" | "iron" | "farm" | "storage" | "hide" | "wall",
  string
>>;

export interface VillageInfo {
  id: number;
  name: string;
  display_name: string;
  wood: number;
  wood_prod: number;
  wood_float: number;
  stone: number;
  stone_prod: number;
  stone_float: number;
  iron: number;
  iron_prod: number;
  iron_float: number;
  pop: number;
  pop_max: number;
  x: number;
  y: number;
  trader_away: number;
  storage_max: number;
  bonus_id: number | null;
  bonus?: Record<string, number>;
  buildings: VillageBuildings;
  player_id: number;
  modifications: number;
  points: number;
  last_res_tick: number;
  coord: string;
  is_farm_upgradable: boolean;

  [k: string]: unknown;
}

export interface GameData {
  player: PlayerInfo;
  quest?: QuestInfo;
  features?: FeaturesMap;

  village: VillageInfo;

  nav?: { parent?: number; [k: string]: unknown };

  link_base: string;        // ex: "/game.php?village=101166&amp;screen="
  link_base_pure: string;   // ex: "/game.php?village=101166&screen="
  csrf: string;

  world: string;            // ex: "br134"
  market: string;           // ex: "br"

  RTL: boolean;
  version: string;          // ex: "d78cd800 release_8.400\n"
  majorVersion: string;     // ex: "8.400"

  screen: string;           // ex: "overview"
  mode: string | null;

  device: "desktop" | "mobile" | string;
  pregame: boolean;

  units: UnitName[];
  locale: string;

  group_id: Intish;

  time_generated: number;

  // Campos extras não mapeados
  [k: string]: unknown;
}
