import { Component, OnInit } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { WsService } from './core/services/ws.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent implements OnInit {
  constructor(private wsService: WsService) {}

  ngOnInit() {
    this.wsService.connect().catch(err => {
      console.error('Error connecting to WebSocket on boot:', err);
    });
  }
}
