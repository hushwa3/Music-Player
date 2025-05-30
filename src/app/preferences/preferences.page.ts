import { Component, OnInit, OnDestroy } from '@angular/core';
import { ConfigService } from '../services/config.service';
import { ToastController } from '@ionic/angular';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-preferences',
  templateUrl: './preferences.page.html',
  styleUrls: ['./preferences.page.scss'],
  standalone: false
})
export class PreferencesPage implements OnInit, OnDestroy {
  isDarkMode = false;
  streamingQuality = 'High';
  downloadQuality = 'High';
  cacheSize = '0 MB';

  private settingsSubscription!: Subscription;

  constructor(
    private configService: ConfigService,
    private toast: ToastController
  ) {}

  async ngOnInit() {
    this.settingsSubscription = this.configService.settings$.subscribe(settings => {
      this.isDarkMode = settings.darkMode;
      this.streamingQuality = settings.streamingQuality;
      this.downloadQuality = settings.downloadQuality;
    });
    this.calculateCacheSize();
  }

  ngOnDestroy() {
    if (this.settingsSubscription) {
      this.settingsSubscription.unsubscribe();
    }
  }

  async toggleTheme(event: any) {
    const isDarkMode = event.detail.checked;
    await this.configService.setDarkMode(isDarkMode);
  }

  async onSetStreaming(quality: string) {
    await this.configService.setStreamingQuality(quality);
    this.showToast('Streaming quality updated');
  }

  async onSetDownload(quality: string) {
    await this.configService.setDownloadQuality(quality);
    this.showToast('Download quality updated');
  }

  async clearCache() {
    this.cacheSize = '0 MB';
    this.showToast('Cache cleared');
  }

  private calculateCacheSize() {
    this.cacheSize = '45 MB';
  }

  private async showToast(msg: string) {
    const toast = await this.toast.create({
      message: msg,
      duration: 2000,
      position: 'bottom',
      color: 'primary'
    });
    await toast.present();
  }
}