import { Component } from '@angular/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { Platform } from '@ionic/angular';
import { ConfigService } from './services/config.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent {
  constructor(
    private platform: Platform,
    private configService: ConfigService
  ) {
    this.initializeApp();
  }

  async initializeApp() {
    await this.platform.ready();
    
    // Initialize theme based on saved settings
    this.configService.initializeTheme();
    
    // Hide splash screen with a slight delay to ensure UI is ready
    setTimeout(() => {
      SplashScreen.hide();
    }, 2000);
  }
}