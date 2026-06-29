import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'xetu_score';

export interface ScoreBadge {
  label: string;
  color: string;
  min: number;
}

// Paliers alignés sur Dashboard/js/mylines.js BADGES (V2.6)
export const SCORE_BADGES: ScoreBadge[] = [
  { label: 'Nouveau', color: '#6B7A99', min: 0 },
  { label: 'Actif', color: '#00D67F', min: 5 },
  { label: 'Régulier', color: '#FF6B35', min: 20 },
  { label: 'Expert', color: '#FF6B35', min: 50 },
  { label: 'Légende', color: '#FFD700', min: 100 }
];

@Injectable({
  providedIn: 'root'
})
export class ScoreService {
  readonly points = signal<number>(this.readScore());

  private readScore(): number {
    try {
      return parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10) || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Incrémente le score de +1. À appeler uniquement quand le backend
   * confirme un signalement réellement nouveau (status === 'recorded'),
   * jamais sur un doublon idempotent (status === 'already_recorded').
   */
  increment(): void {
    try {
      const next = this.readScore() + 1;
      localStorage.setItem(STORAGE_KEY, String(next));
      this.points.set(next);
    } catch {}
  }

  getBadge(points: number): ScoreBadge {
    let badge = SCORE_BADGES[0];
    for (const b of SCORE_BADGES) {
      if (points >= b.min) badge = b;
    }
    return badge;
  }

  getNextBadge(points: number): ScoreBadge | null {
    return SCORE_BADGES.find(b => b.min > points) ?? null;
  }
}
