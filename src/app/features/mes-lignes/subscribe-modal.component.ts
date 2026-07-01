import { Component, Input, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModalController } from '@ionic/angular/standalone';

interface LineItem {
  number: string;
  description: string;
  isSubscribed: boolean;
}

@Component({
  selector: 'app-subscribe-modal',
  templateUrl: './subscribe-modal.component.html',
  styleUrls: ['./subscribe-modal.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class SubscribeModalComponent implements OnInit {
  private readonly modalCtrl = inject(ModalController);

  @Input() currentSubscriptions: string[] = [];
  @Input() knownLines: string[] = [];
  @Input() lineNames: Record<string, string> = {};
  @Input() onSubscribe: (ligne: string) => boolean | void | Promise<boolean | void> = () => {};
  @Input() onUnsubscribe: (ligne: string) => boolean | void | Promise<boolean | void> = () => {};

  searchQuery = '';
  lines: LineItem[] = [];
  filteredLines: LineItem[] = [];

  ngOnInit() {
    this.lines = [...this.knownLines]
      .sort((a, b) => parseFloat(a) - parseFloat(b))
      .map(num => ({
        number: num,
        description: this.lineNames[num] || `Ligne ${num}`,
        isSubscribed: this.currentSubscriptions.includes(num)
      }));
    this.filterLines();
  }

  filterLines() {
    const q = this.searchQuery.toLowerCase().trim();
    this.filteredLines = q
      ? this.lines.filter(l => l.number.toLowerCase().includes(q) || l.description.toLowerCase().includes(q))
      : [...this.lines];
  }

  /**
   * Bascule l'abonnement sans fermer la modale, comme dans
   * Dashboard/js/mylines.js _renderSubscribeLines (toggle multiple
   * lignes possible avant de fermer via Annuler/backdrop).
   */
  async toggleSubscription(line: LineItem) {
    const nextState = !line.isSubscribed;
    line.isSubscribed = nextState;

    const result = nextState
      ? await this.onSubscribe(line.number)
      : await this.onUnsubscribe(line.number);

    if (result === false) {
      line.isSubscribed = !nextState;
    }
  }

  dismiss() {
    this.modalCtrl.dismiss();
  }
}
