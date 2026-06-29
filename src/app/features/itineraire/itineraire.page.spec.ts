import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ItinerairePage } from './itineraire.page';
import { ApiService } from '../../core/services/api.service';
import { of, throwError, Subject } from 'rxjs';
import { By } from '@angular/platform-browser';
import { RouteResponse } from '../../core/models/models';

describe('ItinerairePage', () => {
  let apiServiceSpy: jasmine.SpyObj<ApiService>;

  beforeEach(async () => {
    const spy = jasmine.createSpyObj('ApiService', ['searchStops', 'getRoute']);

    await TestBed.configureTestingModule({
      imports: [ItinerairePage],
      providers: [
        { provide: ApiService, useValue: spy }
      ]
    }).compileComponents();

    apiServiceSpy = TestBed.inject(ApiService) as jasmine.SpyObj<ApiService>;

    // Default mock behavior
    apiServiceSpy.searchStops.and.returnValue(of({ stops: [{ nom: 'Fann', lat: 14.6, lon: -17.4, distance_m: null, lignes: [] }], total: 1, query: 'Fa' }));
  });

  it('should create the page', () => {
    const fixture = TestBed.createComponent(ItinerairePage);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('should trigger searchStops on input change after debounce', fakeAsync(() => {
    const fixture = TestBed.createComponent(ItinerairePage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.onInputChange('from', 'Fa');
    expect(apiServiceSpy.searchStops).not.toHaveBeenCalled(); // Debounce not elapsed

    tick(250); // Elapse debounce
    expect(apiServiceSpy.searchStops).toHaveBeenCalledWith('Fa');
    expect(component.fromSuggestions()).toContain('Fann');
  }));

  it('should select a suggestion and set input value', () => {
    const fixture = TestBed.createComponent(ItinerairePage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.activeInput.set('from');
    component.fromSuggestions.set(['Fann', 'Grand Dakar']);

    component.selectSuggestion('from', 'Fann');

    expect(component.fromQuery()).toBe('Fann');
    expect(component.fromSuggestions().length).toBe(0);
    expect(component.activeInput()).toBeNull();
  });

  it('should swap departure and arrival values', () => {
    const fixture = TestBed.createComponent(ItinerairePage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.fromQuery.set('Fann');
    component.toQuery.set('Leclerc');

    component.swapPoints();

    expect(component.fromQuery()).toBe('Leclerc');
    expect(component.toQuery()).toBe('Fann');
  });

  it('should call getRoute and render results on calculateRoute success', fakeAsync(() => {
    const mockResponse: RouteResponse = {
      status: 'direct',
      routes: [
        {
          number: '219',
          name: 'Express AIBD',
          terminus_a: 'Dakar',
          terminus_b: 'AIBD',
          stops: ['Fann', 'Patte d\'Oie'],
          nb_stops: 2,
          score: 95
        }
      ]
    };
    const routeSubject = new Subject<RouteResponse>();
    apiServiceSpy.getRoute.and.returnValue(routeSubject);

    const fixture = TestBed.createComponent(ItinerairePage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.fromQuery.set('Fann');
    component.toQuery.set('AIBD');
    component.calculateRoute();

    expect(component.isLoading()).toBeTrue();

    routeSubject.next(mockResponse);
    routeSubject.complete();
    tick(); // Resolve route API call
    fixture.detectChanges();

    expect(component.isLoading()).toBeFalse();
    expect(component.routeResult()).toEqual(mockResponse);

    const card = fixture.debugElement.query(By.css('.route-card'));
    expect(card).toBeTruthy();
    expect(card.nativeElement.textContent).toContain('Ligne 219');
    expect(card.nativeElement.textContent).toContain('Express AIBD');
  }));

  it('should display transfer routes from routes array when status is transfer', fakeAsync(() => {
    const mockResponse: RouteResponse = {
      status: 'transfer',
      routes: [
        {
          number1: '4',
          name1: 'Ligne 4',
          stops1: ['Fann', 'Colobane'],
          transfer: 'Colobane',
          number2: '219',
          name2: 'Ligne 219',
          stops2: ['Colobane', 'Leclerc'],
          nb_stops: 5,
          total_min: 35,
          score: 85
        }
      ]
    };
    apiServiceSpy.getRoute.and.returnValue(of(mockResponse));

    const fixture = TestBed.createComponent(ItinerairePage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.fromQuery.set('Fann');
    component.toQuery.set('Leclerc');
    component.calculateRoute();

    tick();
    fixture.detectChanges();

    const card = fixture.debugElement.query(By.css('.transfer-card'));
    expect(card).toBeTruthy();
    expect(card.nativeElement.textContent).toContain('Changement à Colobane');
    expect(card.nativeElement.textContent).toContain('Ligne 4');
    expect(card.nativeElement.textContent).toContain('Ligne 219');
  }));

  it('should display walk_direct routes from routes array', fakeAsync(() => {
    const mockResponse: RouteResponse = {
      status: 'walk_direct',
      routes: [
        {
          number: '4',
          name: 'Ligne 4',
          walk_stop: 'Colobane',
          walk_dist_m: 300,
          walk_min: 5,
          stops: ['Colobane', 'Fann'],
          nb_stops: 2,
          walk_dest_m: 100,
          walk_dest_min: 2,
          total_min: 15,
          score: 80,
          zone: 1
        }
      ]
    };
    apiServiceSpy.getRoute.and.returnValue(of(mockResponse));

    const fixture = TestBed.createComponent(ItinerairePage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.fromQuery.set('Fann');
    component.toQuery.set('Colobane');
    component.calculateRoute();

    tick();
    fixture.detectChanges();

    const card = fixture.debugElement.query(By.css('.walk-card'));
    expect(card).toBeTruthy();
    expect(card.nativeElement.textContent).toContain('Prendre le bus à Colobane');
    expect(card.nativeElement.textContent).toContain('Ligne 4');
    expect(card.nativeElement.textContent).toContain('15 min');
  }));

  it('should display alt_transfer when present on a walk_direct response', fakeAsync(() => {
    const mockResponse: RouteResponse = {
      status: 'walk_direct',
      routes: [],
      alt_transfer: {
        number1: '6',
        name1: 'Ligne 6',
        stops1: ['Liberte 6', 'Centenaire'],
        transfer: 'Centenaire',
        number2: '13',
        name2: 'Ligne 13',
        stops2: ['Centenaire', 'Colobane'],
        nb_stops: 10,
        total_min: 26,
        score: 1560
      }
    };
    apiServiceSpy.getRoute.and.returnValue(of(mockResponse));

    const fixture = TestBed.createComponent(ItinerairePage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.fromQuery.set('Liberte 6');
    component.toQuery.set('Colobane');
    component.calculateRoute();

    tick();
    fixture.detectChanges();

    const card = fixture.debugElement.query(By.css('.transfer-card'));
    expect(card).toBeTruthy();
    expect(card.nativeElement.textContent).toContain('Centenaire');
    expect(card.nativeElement.textContent).toContain('26 min');
  }));

  it('should render appropriate messages for error and same_stop statuses', fakeAsync(() => {
    const mockResponseSame: RouteResponse = { status: 'same_stop' };
    apiServiceSpy.getRoute.and.returnValue(of(mockResponseSame));

    const fixture = TestBed.createComponent(ItinerairePage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.fromQuery.set('Fann');
    component.toQuery.set('Fann');
    component.calculateRoute();

    tick();
    fixture.detectChanges();

    const errorCard = fixture.debugElement.query(By.css('.error-card'));
    expect(errorCard).toBeTruthy();
    expect(errorCard.nativeElement.textContent).toContain('Départ et arrivée identiques');
  }));
});
