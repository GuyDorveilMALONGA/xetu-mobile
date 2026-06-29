import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpHeaders } from '@angular/common/http';
import { Observable, throwError, timer } from 'rxjs';
import { catchError, mergeMap, retry } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { SessionService } from './session.service';
import {
  Bus,
  RouteResponse,
  StopsSearchResponse,
  NearbyResponse,
  SubscriptionsResponse,
  LeaderboardResponse,
  ReportRequest,
  ReportResponse
} from '../models/models';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  constructor(
    private http: HttpClient,
    private sessionService: SessionService
  ) {}

  /**
   * Applies retry logic with exponential backoff on 5xx or network errors.
   */
  private applyRetry<T>(): (source: Observable<T>) => Observable<T> {
    return (source: Observable<T>) =>
      source.pipe(
        retry({
          count: 2,
          delay: (error, retryCount) => {
            // Only retry on network errors (status 0) or server errors (5xx)
            if (error.status === 0 || (error.status >= 500 && error.status < 600)) {
              const backoffDelay = Math.pow(2, retryCount) * 1000;
              return timer(backoffDelay);
            }
            return throwError(() => error);
          }
        })
      );
  }

  private getHeaders(): HttpHeaders {
    const token = this.sessionService.getToken();
    let headers = new HttpHeaders();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  }

  getBuses(): Observable<{ buses: Bus[]; total: number; timestamp: string; error?: string }> {
    return this.http
      .get<{ buses: Bus[]; total: number; timestamp: string; error?: string }>(`${environment.apiBase}/api/buses`)
      .pipe(this.applyRetry());
  }

  getRoute(from: string, to: string, noTransfer: boolean = false): Observable<RouteResponse> {
    let params = new HttpParams().set('from', from).set('to', to);
    if (noTransfer) {
      params = params.set('no_transfer', 'true');
    }
    return this.http
      .get<RouteResponse>(`${environment.apiBase}/api/route`, { params })
      .pipe(this.applyRetry());
  }

  searchStops(query: string, lat?: number, lon?: number): Observable<StopsSearchResponse> {
    let params = new HttpParams().set('q', query);
    if (lat !== undefined && lon !== undefined) {
      params = params.set('lat', lat.toString()).set('lon', lon.toString());
    }
    return this.http
      .get<StopsSearchResponse>(`${environment.apiBase}/api/stops/search`, { params })
      .pipe(this.applyRetry());
  }

  getNearby(lat: number, lon: number, sessionId?: string): Observable<NearbyResponse> {
    let params = new HttpParams().set('lat', lat.toString()).set('lon', lon.toString());
    if (sessionId) {
      params = params.set('session_id', sessionId);
    }
    return this.http
      .get<NearbyResponse>(`${environment.apiBase}/api/nearby`, { params })
      .pipe(this.applyRetry());
  }

  getSubscriptions(sessionId: string): Observable<SubscriptionsResponse> {
    const params = new HttpParams().set('session_id', sessionId);
    return this.http
      .get<SubscriptionsResponse>(`${environment.apiBase}/api/subscriptions`, {
        headers: this.getHeaders(),
        params
      })
      .pipe(this.applyRetry());
  }

  createSubscription(ligne: string, arret?: string | null, heureAlerte?: string | null): Observable<{ status: string; ligne: string; arret: string }> {
    const sessionId = this.sessionService.getSessionId() || '';
    const body = {
      session_id: sessionId,
      ligne,
      arret: arret || null,
      heure_alerte: heureAlerte || null
    };
    return this.http
      .post<{ status: string; ligne: string; arret: string }>(
        `${environment.apiBase}/api/subscriptions`,
        body,
        { headers: this.getHeaders() }
      )
      .pipe(this.applyRetry());
  }

  deleteSubscription(ligne: string, arret: string = ''): Observable<{ status: string; ligne: string; arret: string }> {
    const sessionId = this.sessionService.getSessionId() || '';
    const params = new HttpParams().set('session_id', sessionId).set('arret', arret);
    return this.http
      .delete<{ status: string; ligne: string; arret: string }>(
        `${environment.apiBase}/api/subscriptions/${ligne}`,
        {
          headers: this.getHeaders(),
          params
        }
      )
      .pipe(this.applyRetry());
  }

  getLeaderboard(): Observable<LeaderboardResponse> {
    return this.http
      .get<LeaderboardResponse>(`${environment.apiBase}/api/leaderboard`)
      .pipe(this.applyRetry());
  }

  reportBus(report: ReportRequest): Observable<ReportResponse> {
    const sessionId = this.sessionService.getSessionId();
    const body = {
      ...report,
      session_id: report.session_id || sessionId,
      source: report.source || 'web_signal'
    };
    return this.http
      .post<ReportResponse>(
        `${environment.apiBase}/api/report`,
        body,
        { headers: this.getHeaders() }
      )
      .pipe(this.applyRetry());
  }
}
