import { TestBed } from '@angular/core/testing';
import { SubscribeModalComponent } from './subscribe-modal.component';
import { ModalController } from '@ionic/angular/standalone';

describe('SubscribeModalComponent', () => {
  let modalCtrlSpy: jasmine.SpyObj<ModalController>;

  beforeEach(async () => {
    const spy = jasmine.createSpyObj('ModalController', ['dismiss']);

    await TestBed.configureTestingModule({
      imports: [SubscribeModalComponent],
      providers: [
        { provide: ModalController, useValue: spy }
      ]
    }).compileComponents();

    modalCtrlSpy = TestBed.inject(ModalController) as jasmine.SpyObj<ModalController>;
  });

  it('should create the component', () => {
    const fixture = TestBed.createComponent(SubscribeModalComponent);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('should initialize lines with subscription state', () => {
    const fixture = TestBed.createComponent(SubscribeModalComponent);
    const component = fixture.componentInstance;
    component.currentSubscriptions = ['219', '1'];
    
    component.ngOnInit();

    const line219 = component.lines.find(l => l.number === '219');
    const line2 = component.lines.find(l => l.number === '2');

    expect(line219).toBeTruthy();
    expect(line219?.isSubscribed).toBeTrue();

    expect(line2).toBeTruthy();
    expect(line2?.isSubscribed).toBeFalse();
  });

  it('should filter lines based on search query', () => {
    const fixture = TestBed.createComponent(SubscribeModalComponent);
    const component = fixture.componentInstance;
    component.ngOnInit();

    // Query by line number
    component.searchQuery = '219';
    component.filterLines();
    expect(component.filteredLines.length).toBe(1);
    expect(component.filteredLines[0].number).toBe('219');

    // Query by description text
    component.searchQuery = 'Leclerc';
    component.filterLines();
    // Lines 4, 5, 6 should match "Leclerc" in our LIGNE_NAMES constant
    expect(component.filteredLines.length).toBe(3);
    expect(component.filteredLines.every(l => l.description.includes('Leclerc'))).toBeTrue();
  });

  it('should dismiss modal with subscribe action when toggling unsubscribed line', () => {
    const fixture = TestBed.createComponent(SubscribeModalComponent);
    const component = fixture.componentInstance;
    component.ngOnInit();

    const lineItem = component.filteredLines.find(l => l.number === '2')!;
    expect(lineItem.isSubscribed).toBeFalse();

    component.toggleSubscription(lineItem);

    expect(lineItem.isSubscribed).toBeTrue();
    expect(modalCtrlSpy.dismiss).toHaveBeenCalledWith({
      action: 'subscribe',
      ligne: '2'
    });
  });

  it('should dismiss modal with unsubscribe action when toggling subscribed line', () => {
    const fixture = TestBed.createComponent(SubscribeModalComponent);
    const component = fixture.componentInstance;
    component.currentSubscriptions = ['219'];
    component.ngOnInit();

    const lineItem = component.filteredLines.find(l => l.number === '219')!;
    expect(lineItem.isSubscribed).toBeTrue();

    component.toggleSubscription(lineItem);

    expect(lineItem.isSubscribed).toBeFalse();
    expect(modalCtrlSpy.dismiss).toHaveBeenCalledWith({
      action: 'unsubscribe',
      ligne: '219'
    });
  });

  it('should dismiss modal without data when calling dismiss()', () => {
    const fixture = TestBed.createComponent(SubscribeModalComponent);
    const component = fixture.componentInstance;
    component.dismiss();
    expect(modalCtrlSpy.dismiss).toHaveBeenCalledWith();
  });
});
