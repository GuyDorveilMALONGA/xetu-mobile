import { TestBed } from '@angular/core/testing';
import { SubscribeModalComponent } from './subscribe-modal.component';
import { ModalController } from '@ionic/angular/standalone';
import { By } from '@angular/platform-browser';

// Real MVP lines fixture (Dashboard/js/mylines.js source of truth, not fictional 218/219)
const KNOWN_LINES = ['4', '23'];
const LINE_NAMES: Record<string, string> = {
  '4': 'Liberté 5 ↔ Place Leclerc',
  '23': 'Parcelles Assainies ↔ Palais 1'
};

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

  function createWithInputs(currentSubscriptions: string[] = []) {
    const fixture = TestBed.createComponent(SubscribeModalComponent);
    const component = fixture.componentInstance;
    component.knownLines = KNOWN_LINES;
    component.lineNames = LINE_NAMES;
    component.currentSubscriptions = currentSubscriptions;
    return { fixture, component };
  }

  it('should create the component', () => {
    const { component } = createWithInputs();
    expect(component).toBeTruthy();
  });

  it('should initialize lines from knownLines/lineNames inputs with subscription state', () => {
    const { component } = createWithInputs(['23']);
    component.ngOnInit();

    const line23 = component.lines.find(l => l.number === '23');
    const line4 = component.lines.find(l => l.number === '4');

    expect(line23).toBeTruthy();
    expect(line23?.description).toBe('Parcelles Assainies ↔ Palais 1');
    expect(line23?.isSubscribed).toBeTrue();

    expect(line4).toBeTruthy();
    expect(line4?.isSubscribed).toBeFalse();
  });

  it('should fall back to "Ligne N" when no display name is known', () => {
    const { component } = createWithInputs();
    component.knownLines = ['4', '999'];
    component.lineNames = { '4': 'Liberté 5 ↔ Place Leclerc' };
    component.ngOnInit();

    const line999 = component.lines.find(l => l.number === '999');
    expect(line999?.description).toBe('Ligne 999');
  });

  it('should filter lines based on search query (number or description)', () => {
    const { component } = createWithInputs();
    component.ngOnInit();

    component.searchQuery = '23';
    component.filterLines();
    expect(component.filteredLines.length).toBe(1);
    expect(component.filteredLines[0].number).toBe('23');

    component.searchQuery = 'Leclerc';
    component.filterLines();
    expect(component.filteredLines.length).toBe(1);
    expect(component.filteredLines[0].number).toBe('4');
  });

  it('should render an empty state message when no line matches the search query', () => {
    const { fixture, component } = createWithInputs();
    fixture.detectChanges();

    component.searchQuery = 'inexistante';
    component.filterLines();
    fixture.detectChanges();

    const empty = fixture.debugElement.query(By.css('.subscribe-empty'));
    expect(empty).toBeTruthy();
    expect(fixture.debugElement.queryAll(By.css('.subscribe-chip')).length).toBe(0);
  });

  it('should call onSubscribe and keep the modal open when toggling an unsubscribed line', () => {
    const { component } = createWithInputs();
    const onSubscribe = jasmine.createSpy('onSubscribe');
    const onUnsubscribe = jasmine.createSpy('onUnsubscribe');
    component.onSubscribe = onSubscribe;
    component.onUnsubscribe = onUnsubscribe;
    component.ngOnInit();

    const lineItem = component.filteredLines.find(l => l.number === '4')!;
    expect(lineItem.isSubscribed).toBeFalse();

    component.toggleSubscription(lineItem);

    expect(lineItem.isSubscribed).toBeTrue();
    expect(onSubscribe).toHaveBeenCalledWith('4');
    expect(onUnsubscribe).not.toHaveBeenCalled();
    expect(modalCtrlSpy.dismiss).not.toHaveBeenCalled();
  });

  it('should call onUnsubscribe and keep the modal open when toggling a subscribed line', () => {
    const { component } = createWithInputs(['23']);
    const onSubscribe = jasmine.createSpy('onSubscribe');
    const onUnsubscribe = jasmine.createSpy('onUnsubscribe');
    component.onSubscribe = onSubscribe;
    component.onUnsubscribe = onUnsubscribe;
    component.ngOnInit();

    const lineItem = component.filteredLines.find(l => l.number === '23')!;
    expect(lineItem.isSubscribed).toBeTrue();

    component.toggleSubscription(lineItem);

    expect(lineItem.isSubscribed).toBeFalse();
    expect(onUnsubscribe).toHaveBeenCalledWith('23');
    expect(onSubscribe).not.toHaveBeenCalled();
    expect(modalCtrlSpy.dismiss).not.toHaveBeenCalled();
  });

  it('should allow toggling multiple lines before the modal is dismissed', () => {
    const { component } = createWithInputs();
    const onSubscribe = jasmine.createSpy('onSubscribe');
    component.onSubscribe = onSubscribe;
    component.ngOnInit();

    component.toggleSubscription(component.filteredLines.find(l => l.number === '4')!);
    component.toggleSubscription(component.filteredLines.find(l => l.number === '23')!);

    expect(onSubscribe).toHaveBeenCalledWith('4');
    expect(onSubscribe).toHaveBeenCalledWith('23');
    expect(modalCtrlSpy.dismiss).not.toHaveBeenCalled();
  });

  it('should revert the chip state when the parent rejects the subscription', async () => {
    const { component } = createWithInputs();
    component.onSubscribe = jasmine.createSpy('onSubscribe').and.resolveTo(false);
    component.ngOnInit();

    const lineItem = component.filteredLines.find(l => l.number === '4')!;
    expect(lineItem.isSubscribed).toBeFalse();

    await component.toggleSubscription(lineItem);

    expect(component.onSubscribe).toHaveBeenCalledWith('4');
    expect(lineItem.isSubscribed).toBeFalse();
    expect(modalCtrlSpy.dismiss).not.toHaveBeenCalled();
  });

  it('should dismiss modal without data when calling dismiss()', () => {
    const { component } = createWithInputs();
    component.dismiss();
    expect(modalCtrlSpy.dismiss).toHaveBeenCalledWith();
  });
});
