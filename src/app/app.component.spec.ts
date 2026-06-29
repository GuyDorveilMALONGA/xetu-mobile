import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app.component';
import { WsService } from './core/services/ws.service';

describe('AppComponent', () => {
  let wsServiceSpy: jasmine.SpyObj<WsService>;

  beforeEach(async () => {
    const wsSpy = jasmine.createSpyObj('WsService', ['connect']);
    wsSpy.connect.and.returnValue(Promise.resolve());

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([]),
        { provide: WsService, useValue: wsSpy }
      ]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });
});
