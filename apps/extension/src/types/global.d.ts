// apps/extension/src/types/global.d.ts
import type { GameData } from "./game-data";

declare global {
  interface Window {
    /** Objeto global do TribalWars */
    game_data: GameData;

    TWMap?: { non_attackable_players?: string[] };

    /** Lista (crua) de jogadores não atacáveis disponível na página */
    non_attackable_players?: Array<number | string>;
  }
}

// transforma este arquivo em módulo para o TS aplicar a augmentation
export {};
