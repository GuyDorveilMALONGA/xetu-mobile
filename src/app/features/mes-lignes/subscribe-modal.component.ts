import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonSearchbar,
  IonList,
  IonItem,
  IonLabel,
  IonButton,
  IonButtons
} from '@ionic/angular/standalone';
import { ModalController } from '@ionic/angular/standalone';

export const LIGNE_NAMES: { [key: string]: string } = {
  '1': 'Parcelles Assainies ↔ Palais de Justice',
  '2': 'Pikine ↔ Palais de Justice',
  '3': 'Guédiawaye ↔ Palais de Justice',
  '4': 'Parcelles Assainies ↔ Leclerc',
  '5': 'Guédiawaye ↔ Leclerc',
  '6': 'Pikine ↔ Leclerc',
  '7': 'Thiaroye ↔ Palais de Justice',
  '8': 'Rufisque ↔ Palais de Justice',
  '9': 'Mbao ↔ Palais de Justice',
  '10': 'Parcelles Assainies ↔ Bel Air',
  '11': 'Guédiawaye ↔ Bel Air',
  '12': 'Pikine ↔ Bel Air',
  '218': 'Dakar ↔ Diamniadio (Express)',
  '219': 'Dakar ↔ Blaise Diagne (AIBD)',
};

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
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonSearchbar,
    IonList,
    IonItem,
    IonLabel,
    IonButton,
    IonButtons
  ]
})
export class SubscribeModalComponent implements OnInit {
  @Input() currentSubscriptions: string[] = [];

  searchQuery = '';
  lines: LineItem[] = [];
  filteredLines: LineItem[] = [];

  constructor(private modalCtrl: ModalController) {}

  ngOnInit() {
    this.lines = Object.keys(LIGNE_NAMES).map(num => ({
      number: num,
      description: LIGNE_NAMES[num],
      isSubscribed: this.currentSubscriptions.includes(num)
    }));
    this.filterLines();
  }

  filterLines() {
    const q = this.searchQuery.toLowerCase().trim();
    if (!q) {
      this.filteredLines = [...this.lines];
    } else {
      this.filteredLines = this.lines.filter(
        l => l.number.includes(q) || l.description.toLowerCase().includes(q)
      );
    }
  }

  toggleSubscription(line: LineItem) {
    line.isSubscribed = !line.isSubscribed;
    // Notify the parent component via modal dismissal data
    this.modalCtrl.dismiss({
      action: line.isSubscribed ? 'subscribe' : 'unsubscribe',
      ligne: line.number
    });
  }

  dismiss() {
    this.modalCtrl.dismiss();
  }
}
