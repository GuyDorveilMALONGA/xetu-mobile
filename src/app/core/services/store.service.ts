import { Injectable, signal } from '@angular/core';
import { Bus, ChatMessage, LeaderboardResponse } from '../models/models';

@Injectable({
  providedIn: 'root'
})
export class StoreService {
  wsStatus = signal<'disconnected' | 'connecting' | 'open' | 'closed' | 'failed'>('disconnected');
  messages = signal<ChatMessage[]>([]);
  activeBuses = signal<Bus[]>([]);
  subscriptions = signal<string[]>([]);
  userScore = signal<number>(0);
  leaderboard = signal<any[]>([]);
  stats = signal<{ activeBuses: number; reportsToday: string; contributors: string }>({
    activeBuses: 0,
    reportsToday: '—',
    contributors: '—'
  });
  lastBotMessage = signal<string>('');
  chatTyping = signal<boolean>(false);
  chatStatus = signal<string>('');
  chatSuggestions = signal<string[]>([]);
}
