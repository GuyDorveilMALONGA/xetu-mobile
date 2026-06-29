import { TestBed } from '@angular/core/testing';
import { StoreService } from './store.service';

describe('StoreService', () => {
  let service: StoreService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(StoreService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should initialize with default wsStatus as disconnected', () => {
    expect(service.wsStatus()).toBe('disconnected');
  });

  it('should initialize with empty messages array', () => {
    expect(service.messages()).toEqual([]);
  });

  it('should initialize with empty activeBuses array', () => {
    expect(service.activeBuses()).toEqual([]);
  });

  it('should initialize with empty subscriptions array', () => {
    expect(service.subscriptions()).toEqual([]);
  });

  it('should initialize userScore with 0', () => {
    expect(service.userScore()).toBe(0);
  });
});
