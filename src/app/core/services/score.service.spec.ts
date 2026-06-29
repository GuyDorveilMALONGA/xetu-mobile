import { TestBed } from '@angular/core/testing';
import { ScoreService } from './score.service';

describe('ScoreService', () => {
  let service: ScoreService;

  beforeEach(() => {
    localStorage.removeItem('xetu_score');
    TestBed.configureTestingModule({
      providers: [ScoreService]
    });
    service = TestBed.inject(ScoreService);
  });

  afterEach(() => {
    localStorage.removeItem('xetu_score');
  });

  it('should initialize from localStorage with a zero fallback', () => {
    expect(service.points()).toBe(0);
    expect(service.getBadge(service.points()).label).toBe('Nouveau');
  });

  it('should increment by one and persist the score', () => {
    service.increment();

    expect(service.points()).toBe(1);
    expect(localStorage.getItem('xetu_score')).toBe('1');
  });

  it('should return the reached badge and next badge thresholds', () => {
    expect(service.getBadge(20).label).toBe('Régulier');
    expect(service.getNextBadge(20)?.label).toBe('Expert');
    expect(service.getNextBadge(100)).toBeNull();
  });
});
