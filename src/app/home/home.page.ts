import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  NgZone
} from '@angular/core';
import { Router } from '@angular/router';
import {
  ToastController,
  LoadingController,
  AlertController,
  Platform
} from '@ionic/angular';
import { MediaPlayerService, Track } from '../services/media-player.service';
import { DataService } from '../services/data.service';
import { StreamingService } from '../services/streaming.service';
import { ConfigService } from '../services/config.service';
import { MediaScannerService } from '../services/media-scanner.service';
import { firstValueFrom, Observable, of, Subscription } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { register } from 'swiper/element/bundle';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: false
})
export class HomePage implements OnInit, OnDestroy {
  @ViewChild('searchInput', { read: ElementRef }) searchInput!: ElementRef;
  @ViewChild('fileInput', { static: false }) fileInput!: ElementRef<HTMLInputElement>;

  // ---- Local music ----
  localMusic: Track[] = [];
  localAudio = new Audio();
  localPlaying = false;
  localDuration = 0;
  localCurrentTime = 0;

  // ---- Search/streaming ----
  searchActive = false;
  searchQuery = '';
  searchResults: Track[] = [];

  categories: any[] = [];
  newReleases: Track[] = [];
  featuredPlaylists: any[] = [];
  recommendedTracks: Track[] = [];
  selectedCategory = 'all';

  // Settings & loading
  isDarkMode = false;
  isLoading = false;
  private settingsSub?: Subscription;
  showGenreTracks: boolean | any;
  genreTracks: Track[] | any;

  // Mini-player status and touch gesture variables
  hideMiniPlayer = false;
  isClosing = false;
  slideOffset = 0;
  touchStartY = 0;
  dismissThreshold = 80;

  constructor(
    public audioService: MediaPlayerService,
    private dataService: DataService,
    private streamingService: StreamingService,
    private configService: ConfigService,
    private mediaScanner: MediaScannerService,
    public router: Router,
    private toastCtrl: ToastController,
    private loadingCtrl: LoadingController,
    private alertCtrl: AlertController,
    private platform: Platform
  ) {}

  async ngOnInit() {
    // wire up local-audio events
    this.localAudio.addEventListener('loadedmetadata', () => {
      this.localDuration = this.localAudio.duration;
    });
    this.localAudio.addEventListener('timeupdate', () => {
      this.localCurrentTime = this.localAudio.currentTime;
    });
    this.localAudio.addEventListener('ended', () => {
      this.localPlaying = false;
    });

    // Settings subscription
    this.settingsSub = this.configService.settings$.subscribe(s => {
      this.isDarkMode = s.darkMode;
      document.body.setAttribute('color-theme', s.darkMode ? 'dark' : 'light');
    });
    await this.dataService.ensureInit();
    await this.refreshLocalMusic();
    await this.loadInitialData();
    this.hideMiniPlayer = false;
    this.slideOffset = 0; // Initialize slide offset
  }

  ngOnDestroy() {
    this.localAudio.pause();
    this.localAudio.src = '';
    this.settingsSub?.unsubscribe();
  }

  // Add methods for interacting with the player 
  togglePlay() {
    this.audioService.togglePlay();
  }

  seekTrack(position: number) {
    this.audioService.seek(position);
  }

  onRangeChange(event: any) {
  const value = event.detail.value;
  if (typeof value === 'number') {
    this.seekTrack(value);
  } else if (value && typeof value.lower === 'number') {
    // In case a RangeValue is emitted, just use the 'lower' value
    this.seekTrack(value.lower);
  }
}

  toggleTrackLike(track: Track) {
    if (track) {
      this.audioService.toggleLike(track);
    }
  }

  // Format time for mini-player
  formatTime(time: number | null): string {
    if (time === null) return '0:00';
    
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  }

  // Touch gesture methods for mini-player
  onTouchStart(event: TouchEvent) {
    this.touchStartY = event.touches[0].clientY;
    event.stopPropagation();
  }

  onTouchMove(event: TouchEvent) {
    // Calculate how far the user has dragged down
    const touchY = event.touches[0].clientY;
    const deltaY = touchY - this.touchStartY;

    // Only allow dragging down, not up
    if (deltaY >= 0) {
      this.slideOffset = deltaY;
    } else {
      this.slideOffset = 0;
    }

    // Prevent other touch interactions while dragging
    event.preventDefault();
    event.stopPropagation();
  }

  async onTouchEnd(event: TouchEvent) {
    // If user has dragged enough, dismiss the player
    if (this.slideOffset > this.dismissThreshold) {
      // Add closing class for animation
      this.isClosing = true;

      try {
        // Pause playback
        await this.audioService.pause();

        // Show a toast notification
        const toast = await this.toastCtrl.create({
          message: 'Playback stopped',
          duration: 1500,
          position: 'bottom',
          color: 'medium'
        });
        await toast.present();

        // Hide mini player visually but keep track info
        setTimeout(() => {
          this.hideMiniPlayer = true;
          this.isClosing = false;
        }, 300); // Match this to your animation duration

        console.log('Playback stopped, mini player hidden until next track');
      } catch (error) {
        console.error('Error stopping playback:', error);
      }
    } else {
      // Not enough to dismiss, reset position
      this.slideOffset = 0;
    }

    // Ensure propagation is stopped
    event.stopPropagation();
  }

  private async loadInitialData() {
    const load = await this.loadingCtrl.create({ message: 'Loading music…' });
    await load.present();
    this.isLoading = true;

    try {
      // Init storage & local music
      await this.dataService.ensureInit();
      await this.refreshLocalMusic();

      // Then try to load streaming content
      const authOk = await firstValueFrom(this.streamingService.authenticate());

      if (authOk) {
        // Load categories, new releases and playlists in parallel
        const [cats, newRel, playlists] = await Promise.all([
          firstValueFrom(this.streamingService.getGenres()),
          firstValueFrom(this.streamingService.getNewReleases()),
          firstValueFrom(this.streamingService.getPlaylistsByGenre(this.selectedCategory))
        ]);

        // Set categories from API
        this.categories = cats.categories.items;

        // Don't include local music in new releases
        this.newReleases = newRel.albums.items.map((a: any) => this.mapSpotifyAlbumToTrack(a));

        // Set featured playlists
        this.featuredPlaylists = playlists;

        // Don't include local music in recommended tracks
        this.recommendedTracks = newRel.albums.items.map((a: any) => this.mapSpotifyAlbumToTrack(a));
      } else {
        // If authentication fails, set empty arrays for streaming content
        this.newReleases = [];
        this.recommendedTracks = [];

        // Show a toast for the user to know streaming content couldn't be loaded
        const toast = await this.toastCtrl.create({
          message: 'Could not load streaming content. Only local music is available.',
          duration: 3000,
          position: 'bottom',
          color: 'warning'
        });
        await toast.present();
      }
    } catch (error) {
      console.error('Error loading initial data:', error);

      // Set empty arrays for streaming content on error
      this.newReleases = [];
      this.recommendedTracks = [];

      // Show error toast
      const toast = await this.toastCtrl.create({
        message: 'Error loading streaming content. Only local music is available.',
        duration: 3000,
        position: 'bottom',
        color: 'danger'
      });
      await toast.present();
    } finally {
      this.isLoading = false;
      load.dismiss();
    }
  }

  private async refreshLocalMusic() {
    try {
      this.localMusic = await this.dataService.getLocalTracks();
      return this.localMusic;
    } catch (error) {
      console.error('Error refreshing local music:', error);
      throw error;
    }
  }

  async requestAudioPermissions() {
    if (Capacitor.isNativePlatform()) {
      try {
        // Request filesystem permissions which include audio access
        await Filesystem.requestPermissions();
        return true;
      } catch (e) {
        console.error('Error requesting permissions:', e);
        return false;
      }
    }
    return true; // In web, permissions work differently
  }

  async scanDeviceForMusic() {
    const loading = await this.loadingCtrl.create({
      message: 'Scanning for music files...'
    });
    await loading.present();

    try {
      const tracks = await this.mediaScanner.scanDeviceForMusic();
      await this.refreshLocalMusic();
      
      const toast = await this.toastCtrl.create({
        message: `Found ${tracks.length} music files`,
        duration: 2000,
        position: 'bottom',
        color: 'success'
      });
      await toast.present();
    } catch (error) {
      console.error('Error scanning for music:', error);
      const toast = await this.toastCtrl.create({
        message: 'Could not scan for music files',
        duration: 2000,
        position: 'bottom',
        color: 'danger'
      });
      await toast.present();
    } finally {
      loading.dismiss();
    }
  }

  openFileSelector() {
    this.fileInput.nativeElement.click();
  }

  async onFileSelected(evt: Event) {
    const input = evt.target as HTMLInputElement;
    if (!input.files?.length) return;

    const files = Array.from(input.files);

    // 1) Gather existing filenames (basename of localPath, or title)
    const existingFileNames = new Set(
      this.localMusic.map(t => {
        const pathOrTitle = t.localPath || t.title;
        return pathOrTitle.split('/').pop()!.toLowerCase();
      })
    );

    // 2) Split incoming files into new vs. duplicates
    const newFiles = files.filter(f => !existingFileNames.has(f.name.toLowerCase()));
    const dupFiles = files.filter(f => existingFileNames.has(f.name.toLowerCase()));

    // 3) Warn about duplicates
    if (dupFiles.length) {
      const dupToast = await this.toastCtrl.create({
        message: `Skipped ${dupFiles.length} duplicate file(s).`,
        duration: 2000,
        position: 'bottom',
        color: 'warning'
      });
      await dupToast.present();
    }

    if (!newFiles.length) {
      input.value = '';
      return;  // nothing to upload
    }

    // 4) Proceed with uploading only newFiles…
    const loading = await this.loadingCtrl.create({ message: 'Uploading music…' });
    await loading.present();

    try {
      for (const file of newFiles) {
        const track = await this.audioService.addLocalTrack(file);
        const okToast = await this.toastCtrl.create({
          message: `"${track.title}" uploaded successfully!`,
          duration: 1500,
          position: 'bottom',
          color: 'success'
        });
        await okToast.present();
      }
      await this.refreshLocalMusic();
    } catch (error) {
      console.error('Error uploading file:', error);
      const errToast = await this.toastCtrl.create({
        message: 'Error uploading some files.',
        duration: 2000,
        position: 'bottom',
        color: 'danger'
      });
      await errToast.present();
    } finally {
      input.value = '';
      loading.dismiss();
    }
  }

  toggleLocalPlay() {
    if (this.localPlaying) {
      this.localAudio.pause();
    } else {
      this.localAudio.play();
    }
    this.localPlaying = !this.localPlaying;
  }

  /** Seek local audio */
  seekLocal(pos: number) {
    this.localAudio.currentTime = pos;
  }

  playTrack(track: Track) {
    this.hideMiniPlayer = false;
    this.slideOffset = 0; // Reset slide offset when playing a new track
    this.audioService.play(track);
    this.router.navigate(['/player']);
  }

  playPlaylist(playlistId: string) {
    this.streamingService
      .getPlaylistTracks(playlistId)
      .pipe(
        map((items: any[]) =>
          items
            .map((i) => i.track)
            .filter((t) => t && t.preview_url) // Only include tracks with preview URLs
            .map((t) => this.mapSpotifyTrack(t))
        ),
        catchError((err) => {
          console.error('Playlist load error', err);
          this.showError('Could not load playlist.');
          return of<Track[]>([]);
        })
      )
      .subscribe((tracks) => {
        if (tracks.length) {
          console.log('Playing playlist with tracks:', tracks);
          this.audioService.setQueue(tracks);
          this.router.navigate(['/player']);
        } else {
          this.showError('No playable tracks in this playlist.');
        }
      });
  }

  // Rest of your existing methods...
  
  async selectCategory(categoryId: string) {
    console.log('Selecting category:', categoryId);
    this.selectedCategory = categoryId;

    // Show loading indicator
    const loading = await this.loadingCtrl.create({
      message: 'Loading music...',
    });
    await loading.present();

    try {
      // First, get playlists for this category (original behavior)
      this.featuredPlaylists = await firstValueFrom(
        this.streamingService.getPlaylistsByGenre(categoryId)
      );

      // Also get tracks for this genre
      if (categoryId === 'all') {
        // For 'all', just use recommended tracks
        this.showGenreTracks = false;
      } else {
        // For specific genres, get tracks for that genre
        const tracks = await firstValueFrom(
          this.streamingService.getTracksByGenre(categoryId)
        );

        if (tracks && tracks.length > 0) {
          this.genreTracks = tracks;
          this.showGenreTracks = true;
          console.log(`Loaded ${tracks.length} tracks for genre ${categoryId}`);
        } else {
          this.showGenreTracks = false;
          this.showError(`No tracks found for "${categoryId}"`);
        }
      }

      if (!this.featuredPlaylists.length && !this.genreTracks.length) {
        this.showError(`No content found for "${categoryId}".`);
      }
    } catch (error) {
      console.error('Error loading category content:', error);
      this.showError('Failed to load content for this category.');
    } finally {
      loading.dismiss();
    }
  }

  // ───── SEARCH ─────

  toggleSearch() {
    this.searchActive = !this.searchActive;
    if (this.searchActive) {
      setTimeout(() => this.searchInput.nativeElement.focus(), 200);
    } else {
      this.searchQuery = '';
      this.searchResults = [];
    }
  }
  
  clearSearch() {
    this.searchQuery = '';
    this.searchResults = [];
  }
  
  onSearchFocus() { /* Search focus handler */ }
  onSearchBlur() { /* Search blur handler */ }
  
  onSearch() {
    const q = this.searchQuery.trim().toLowerCase();
    if (!q) {
      this.searchResults = [];
      return;
    }
    // first local
    const local = this.localMusic.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.artist.toLowerCase().includes(q)
    );
    if (local.length) {
      this.searchResults = local;
    } else {
      this.streamingService.searchTracks(q, 20)
        .pipe(
          map(r => r.tracks.items.map((i: any) => this.mapSpotifyTrack(i))),
          catchError(() => of<Track[]>([]))
        )
        .subscribe(res => (this.searchResults = res));
    }
  }

  // ───── HELPERS & MAPPERS ─────

  private mapSpotifyTrack(i: any): Track {
    return {
      id: i.id,
      title: i.name,
      artist: i.artists.map((a: any) => a.name).join(', '),
      album: i.album.name,
      duration: i.duration_ms / 1000,
      imageUrl: i.album.images[0]?.url,
      previewUrl: i.preview_url,
      spotifyId: i.id,
      liked: false,
      isLocal: false
    };
  }

  private mapSpotifyAlbumToTrack(a: any): Track {
    return {
      id: a.id,
      title: a.name,
      artist: a.artists.map((x: any) => x.name).join(', '),
      album: a.name,
      duration: 0,
      imageUrl: a.images[0]?.url,
      previewUrl: '',
      spotifyId: a.id,
      liked: false,
      isLocal: false
    };
  }

  private async showError(msg: string) {
    const alert = await this.alertCtrl.create({
      header: 'Error',
      message: msg,
      buttons: ['OK']
    });
    await alert.present();
  }

  async doRefresh(event: any) {
    console.log('Begin refresh operation');

    try {
      // Refresh local music
      await this.refreshLocalMusic();

      // Attempt to refresh online content separately
      try {
        const authOk = await firstValueFrom(this.streamingService.authenticate());

        if (authOk) {
          // Load new releases and playlists
          const [newRel, playlists] = await Promise.all([
            firstValueFrom(this.streamingService.getNewReleases()),
            firstValueFrom(this.streamingService.getPlaylistsByGenre(this.selectedCategory))
          ]);

          // Update streaming content WITHOUT including local music
          this.newReleases = newRel.albums.items.map((a: any) => this.mapSpotifyAlbumToTrack(a));
          this.featuredPlaylists = playlists;
          this.recommendedTracks = newRel.albums.items.map((a: any) => this.mapSpotifyAlbumToTrack(a));
        }
      } catch (streamingError) {
        console.error('Error refreshing streaming content:', streamingError);
        // Keep existing streaming content, don't reset to empty arrays
      }

      // Show a success toast
      const toast = await this.toastCtrl.create({
        message: 'Music library refreshed!',
        duration: 2000,
        position: 'bottom',
        color: 'success'
      });
      toast.present();

      console.log('Refresh completed successfully');
    } catch (error) {
      console.error('Error during refresh:', error);

      // Show error toast
      const toast = await this.toastCtrl.create({
        message: 'Could not refresh content. Please try again.',
        duration: 2000,
        position: 'bottom',
        color: 'danger'
      });
      toast.present();
    } finally {
      // Always complete the refresher
      event.target.complete();
    }
  }
}