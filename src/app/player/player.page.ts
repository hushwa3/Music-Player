import { Component, OnInit, OnDestroy, NgZone, ViewChild } from '@angular/core';
import { Location } from '@angular/common';
import { Subscription } from 'rxjs';
import { MediaPlayerService, Track } from '../services/media-player.service'; // Update these imports
import { ConfigService } from '../services/config.service'; // Update these imports
import { DataService } from '../services/data.service'; // Update these imports
import { AlertController, ToastController } from '@ionic/angular';
import { firstValueFrom, take } from 'rxjs';

@Component({
  selector: 'app-player',
  templateUrl: './player.page.html',
  styleUrls: ['./player.page.scss'],
  standalone: false
})
export class PlayerPage implements OnInit, OnDestroy {
  currentTrack: Track | null = null;
  isPlaying = false;
  currentTime = 0;
  duration = 0;
  isDarkMode?: boolean;
  isLocalTrack = false;

  private subs: Subscription[] = [];
  private settingsSub?: Subscription;
  showActions = false;
  actionButtons: any[] = [];
  @ViewChild('actionSheet') actionSheet: any;

  constructor(
    public mediaPlayer: MediaPlayerService, // Update service names
    private configService: ConfigService,  // Update service names
    private dataService: DataService,  // Update service names
    private location: Location,
    private alertCtrl: AlertController,
    private toast: ToastController,
    private zone: NgZone
  ) {}

  ngOnInit() {
    // 1) Theme toggling
    this.settingsSub = this.configService.settings$.subscribe(settings => {
      this.isDarkMode = settings.darkMode;
      document.body.setAttribute(
        'color-theme',
        settings.darkMode ? 'dark' : 'light'
      );
    });

   this.subs.push(
    this.mediaPlayer.getCurrentTrack().subscribe(track => {
      console.log('Now playing subscription updated with track:', track);
      if (track !== this.currentTrack) {
        this.zone.run(() => {
          this.currentTrack = track;
          this.isLocalTrack = track?.isLocal || false;
        });
      }
    })
  );

  this.subs.push(
    this.mediaPlayer.getIsPlaying().subscribe(playing => {
      console.log('Playing state updated:', playing);
      if (playing !== this.isPlaying) {
        this.zone.run(() => {
          this.isPlaying = playing;
        });
      }
    })
  );

  this.subs.push(
    this.mediaPlayer.getCurrentTime().subscribe(time => {
      this.zone.run(() => {
        this.currentTime = time;
      });
    })
  );
   this.subs.push(
    this.mediaPlayer.getDuration().subscribe(duration => {
      this.zone.run(() => {
        this.duration = duration;
      });
    })
  );

  setTimeout(() => {
      if (!this.currentTrack && !this.isPlaying) {
        this.checkAndPlayCurrentTrack();
      }
    }, 500);
  }

  ngOnDestroy() {
    this.subs.forEach(s => s.unsubscribe());
    this.settingsSub?.unsubscribe();
  }

 private checkAndPlayCurrentTrack() {
  console.log('Checking for current track to play...');
  const sub = this.mediaPlayer.getCurrentTrack().pipe(
    take(1)  // Make sure we only take one value
  ).subscribe(track => {
    console.log('Got track from current track observable:', track);
    if (track) {
      try {
        console.log('Attempting to play current track:', track.title);
        this.mediaPlayer.play(track);
      } catch (err) {
        console.error('Error playing track:', err);
        this.showAlert('Playback Error',
          'Could not play the current track. Please try selecting another track.');
      }
    } else {
      console.log('No current track found');
    }
  });
}

  goBack() {
    this.location.back();
  }

async togglePlay() {
  if (!this.currentTrack) {
    console.log('No track selected');
    return;
  }

  try {
    console.log('Current track:', this.currentTrack);
    console.log('Current playing state:', this.isPlaying);
    
    if (this.isPlaying) {
      // Already playing, so just pause
      console.log('Pausing playback');
      await this.mediaPlayer.pause();
    } else {
      // Handle both scenarios - initial play and resume
      const player = this.mediaPlayer.getCurrentPlayer();
      console.log('Player state:', player ? 'exists' : 'null', 
                  player ? `currentTime: ${player.currentTime}, paused: ${player.paused}` : '');
                  
      if (player && player.src && player.currentTime > 0) {
        // Resume existing playback
        console.log('Resuming existing playback');
        await this.mediaPlayer.resume();
      } else {
        // Start fresh playback
        console.log('Starting fresh playback');
        await this.mediaPlayer.play(this.currentTrack);
      }
    }
  } catch (error) {
    console.error('Detailed playback error:', error);
    // Show more specific error to help debug
    const errorDetails = error instanceof Error ? 
      `${error.name}: ${error.message}` : JSON.stringify(error);
    this.showAlert('Playback Issue', `Please try again. Technical details: ${errorDetails}`);
  }
}

seek(event: any) {
  try {
    if (!event || !event.detail) {
      console.error('Invalid seek event:', event);
      return;
    }
    
    const newValue = event.detail.value;
    console.log(`Seeking to ${newValue}s`);
    
    if (typeof newValue !== 'number' || isNaN(newValue)) {
      console.warn('Invalid seek value:', newValue);
      return;
    }
    
    this.currentTime = newValue;
    this.mediaPlayer.seek(newValue);
  } catch (error) {
    console.error('Error seeking:', error);
  }
}

onSeekDrag(event: any) {
  this.currentTime = event.detail.value;
}

  previous() {
    this.mediaPlayer.previous();
  }

  next() {
    this.mediaPlayer.next();
  }

  formatTime(seconds: number): string {
    if (isNaN(seconds) || seconds === undefined || seconds < 0) {
      return '0:00';
    }
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  async toggleLike() {
    if (!this.currentTrack) return;
    try {
      await this.mediaPlayer.toggleLike(this.currentTrack);
      const msg = this.currentTrack.liked
        ? 'Added to Liked'
        : 'Removed from Liked';
      const t = await this.toast.create({
        message: msg,
        duration: 1500,
        position: 'bottom',
        color: 'success'
      });
      await t.present();
    } catch (err) {
      console.error('Error toggling like status:', err);
      this.showAlert('Error', 'Could not update like status.');
    }
  }

  private async showAlert(header: string, msg: string) {
    const a = await this.alertCtrl.create({
      header,
      message: msg,
      buttons: ['OK']
    });
    await a.present();
  }

  showActionMenu(event: Event) {
    event.stopPropagation();

    if (!this.currentTrack) {
      this.showAlert('No Track', 'No track is currently selected.');
      return;
    }

    this.actionButtons = [
      {
        text: 'Delete Track',
        role: 'destructive',
        icon: 'trash',
        handler: () => {
          this.confirmDeleteTrack(this.currentTrack!);
        }
      },
      {
        text: 'Share',
        icon: 'share',
        handler: () => {
          this.showAlert('Share', 'Share functionality is not implemented yet.');
        }
      },
      {
        text: this.currentTrack?.liked ? 'Remove from Liked' : 'Add to Liked',
        icon: 'heart',
        handler: () => {
          this.toggleLike();
        }
      },
      {
        text: 'Cancel',
        role: 'cancel',
        icon: 'close'
      }
    ];
    this.showActions = true;
  }

  async deleteTrack(track: Track) {
    try {
      if (this.isPlaying) {
        await this.mediaPlayer.pause();
      }

      if (track.isLocal) {
        await this.mediaPlayer.clearCurrentTrack();
        await this.dataService.deleteLocalTrack(track.id);
        const toast = await this.toast.create({
          message: `"${track.title}" has been deleted`,
          duration: 2000,
          position: 'bottom',
          color: 'success'
        });
        await toast.present();
        this.goBack();
      } else {
        this.showAlert(
          'Cannot Delete',
          'Only local tracks can be deleted. Streaming tracks are managed externally.'
        );
      }
    } catch (error) {
      console.error('Error deleting track:', error);
    }
  }

  async confirmDeleteTrack(track: Track) {
    const alert = await this.alertCtrl.create({
      header: 'Delete Track',
      message: `Are you sure you want to delete "${track.title}"?`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Delete',
          role: 'destructive',
          handler: () => {
            this.deleteTrack(track);
          }
        }
      ]
    });

    await alert.present();
  }
}