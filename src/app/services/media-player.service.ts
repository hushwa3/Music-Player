import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { DataService } from './data.service';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Platform } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  imageUrl: string;
  previewUrl: string;
  spotifyId: string;
  liked: boolean;
  isLocal?: boolean;
  localPath?: string;
}

@Injectable({ providedIn: 'root' })
export class MediaPlayerService {
  private audioPlayer: HTMLAudioElement;
  private localAudioPlayer: HTMLAudioElement;
  private _savedPosition: number | undefined = undefined;
  private currentTrack$ = new BehaviorSubject<Track | null>(null);
  private isPlaying$ = new BehaviorSubject<boolean>(false);
  private currentTime$ = new BehaviorSubject<number>(0);
  private duration$ = new BehaviorSubject<number>(0);
  private queue: Track[] = [];
  private queueIndex = 0;
  private timerId: any;
  private _currentBlobUrl: string | null = null;
  private _trackReady = false;

  constructor(
    private dataService: DataService,
    private platform: Platform
  ) {
    this.audioPlayer = new Audio();
    this.localAudioPlayer = new Audio();
    this.configureAudioElement(this.audioPlayer);
    this.configureAudioElement(this.localAudioPlayer);
    this.setupAudioEvents();
    this.restoreLastTrack();
  }

  private configureAudioElement(audio: HTMLAudioElement) {
    audio.autoplay = false;
    audio.preload = 'auto';
    audio.crossOrigin = 'anonymous';
    audio.volume = 1.0;
  }

  private setupAudioEvents() {
    this.audioPlayer.addEventListener('loadedmetadata', () => {
      console.log('Audio loadedmetadata event, duration:', this.audioPlayer.duration);
      this.duration$.next(this.audioPlayer.duration);
      this._trackReady = true;
    });

    this.audioPlayer.addEventListener('timeupdate', () => {
      this.currentTime$.next(this.audioPlayer.currentTime);
    });

    this.audioPlayer.addEventListener('play', () => {
      console.log('Audio play event fired');
      this.isPlaying$.next(true);
      this.startUpdates();
    });

    this.audioPlayer.addEventListener('pause', () => {
      console.log('Audio pause event fired');
      this.isPlaying$.next(false);
      this.stopUpdates();
    });

    this.audioPlayer.addEventListener('ended', () => {
      console.log('Audio ended event fired');
      this.next();
    });

    this.audioPlayer.addEventListener('error', (e: any) => {
      const error = this.audioPlayer.error;
      console.error('Audio playback error:', e);
      console.error('Error code:', error ? error.code : 'unknown');
      console.error('Error message:', error ? error.message : 'unknown');
      this.isPlaying$.next(false);
    });

    this.localAudioPlayer.addEventListener('loadedmetadata', () => {
      console.log('Local audio loadedmetadata event, duration:', this.localAudioPlayer.duration);
      this.duration$.next(this.localAudioPlayer.duration);
      this._trackReady = true;
    });

    this.localAudioPlayer.addEventListener('timeupdate', () => {
      this.currentTime$.next(this.localAudioPlayer.currentTime);
    });

    this.localAudioPlayer.addEventListener('play', () => {
      console.log('Local audio play event fired');
      this.isPlaying$.next(true);
      this.startUpdates();
    });

    this.localAudioPlayer.addEventListener('pause', () => {
      console.log('Local audio pause event fired');
      this.isPlaying$.next(false);
      this.stopUpdates();
    });

    this.localAudioPlayer.addEventListener('ended', () => {
      console.log('Local audio ended event fired');
      this.next();
    });

    this.localAudioPlayer.addEventListener('error', (e: any) => {
      const error = this.localAudioPlayer.error;
      console.error('Local audio playback error:', e);
      console.error('Error code:', error ? error.code : 'unknown');
      console.error('Error message:', error ? error.message : 'unknown');
      this.isPlaying$.next(false);
    });
  }

  private startUpdates() {
    this.stopUpdates(); // clear any existing timer
    this.timerId = setInterval(() => {
      const activePlayer = this.getCurrentPlayer();
      this.currentTime$.next(activePlayer.currentTime);
    }, 500);
  }

  private stopUpdates() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  public getCurrentPlayer(): HTMLAudioElement {
    const track = this.currentTrack$.getValue();
    return track?.isLocal ? this.localAudioPlayer : this.audioPlayer;
  }

  private async restoreLastTrack() {
    try {
      const saved = await this.dataService.get('last_played_track') as Track | null;
      if (saved) {
        if (saved.isLocal) {
          const exists = await this.dataService.getTrack(saved.id);
          if (!exists) {
            console.log('Last played track no longer exists');
            return;
          }
        }
        this.currentTrack$.next(saved);
        console.log('Restored last played track:', saved.title);
      }
    } catch (err) {
      console.error('[MediaPlayerService] restoreLastTrack error:', err);
    }
  }

  private saveLastTrack(track: Track) {
    this.dataService.set('last_played_track', track);
    console.log('Saved as last played track:', track.title);
  }

async play(track: Track): Promise<void> {
  this.cleanup();
  
  // FIX 1: Make sure track has necessary properties
  if (!track) {
    console.error('Null track provided to play method');
    throw new Error('No track to play');
  }
  
  // FIX 2: Fix file paths for local tracks
  if (track.isLocal) {
    // Make sure we have a path
    if (!track.previewUrl && track.localPath) {
      console.log('Using localPath instead of previewUrl');
      track.previewUrl = track.localPath;
    }
    
    // Add the proper file:// prefix if missing for native platforms
    if (Capacitor.isNativePlatform() && track.previewUrl && !track.previewUrl.startsWith('file://')) {
      console.log('Adding file:// prefix to previewUrl');
      track.previewUrl = `file://${track.previewUrl}`;
    }
    
    // Debug info
    console.log('Final track path:', track.previewUrl);
  }
  
  this.currentTrack$.next(track);
  this.saveLastTrack(track);
  console.log(`Playing track: ${track.title}, isLocal: ${track.isLocal}`);

    try {
      if (track.isLocal ) {
        const player = this.localAudioPlayer;
        console.log('Using local audio player');

        if (Capacitor.isNativePlatform()) {
          console.log('Playing local track on native platform:', track.previewUrl);
          const audioSrc = Capacitor.convertFileSrc(track.previewUrl);
          console.log('Converted file source:', audioSrc);
          player.src = audioSrc;
          player.load();
          try {
            await player.play();
            this.isPlaying$.next(true);
            this.startUpdates();
            console.log('Local playback started successfully');
          } catch (playError) {
            console.error('Error starting local playback:', playError);
            throw playError;
          }
        } else {
          console.log('Playing local track on web platform');
          try {
            console.log('Reading file from:', track.previewUrl);
            const fileData = await Filesystem.readFile({
              path: track.previewUrl.replace('file://', ''),
              directory: Directory.Data,
            });
            console.log('File read successfully, creating blob');

            if (fileData.data) {
              let blob: Blob;
              if (fileData.data instanceof Blob) {
                const arrayBuffer = await fileData.data.arrayBuffer();
                blob = this.base64ToBlob(this.arrayBufferToBase64(arrayBuffer), 'audio/mpeg');
              } else {
                blob = this.base64ToBlob(fileData.data, 'audio/mpeg');
              }
              const url = URL.createObjectURL(blob);
              this._currentBlobUrl = url;
              console.log('Blob URL created:', url);
              player.src = url;
              player.load();
              
              await player.play();
              this.isPlaying$.next(true);
              this.startUpdates();
              console.log('Web playback started successfully');
            } else {
              console.error('File data is empty');
              throw new Error('File data is empty');
            }
          } catch (webPlayError) {
            console.error('Error playing web audio:', webPlayError);
            throw webPlayError;
          }
        }
      } else {
        console.log('Playing streaming track:', track.previewUrl);
        this.audioPlayer.src = track.previewUrl;
        this.audioPlayer.load();
        await this.audioPlayer.play();
        this.isPlaying$.next(true);
        console.log('Streaming playback started');
      }
    } catch (e) {
      console.error('Playback failed:', e);
      this.isPlaying$.next(false);
      throw e;
    }
  }

private base64ToBlob(data: string | ArrayBuffer, mimeType: string): Blob {
  try {
    let base64String: string;

    if (typeof data === 'string') {
      base64String = data;
    } else {
      base64String = this.arrayBufferToBase64(data);
    }

    // Check if string is actually base64
    if (!base64String || base64String.trim() === '') {
      console.error('Empty base64 string');
      return new Blob([], { type: mimeType });
    }

    // Basic validation that it's a valid base64 string
    if (base64String.length % 4 !== 0) {
      console.warn('Base64 string length not multiple of 4, may be invalid');
    }

    try {
      const byteCharacters = atob(base64String);
      const byteArrays = [];

      for (let offset = 0; offset < byteCharacters.length; offset += 512) {
        const slice = byteCharacters.slice(offset, offset + 512);
        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
          byteNumbers[i] = slice.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        byteArrays.push(byteArray);
      }
      
      console.log(`Created blob with MIME type: ${mimeType}, size: ${byteArrays.reduce((sum, arr) => sum + arr.length, 0)} bytes`);
      return new Blob(byteArrays, { type: mimeType });
    } catch (error) {
      console.error('Error decoding base64:', error);
      throw new Error('Invalid base64 data');
    }
  } catch (error) {
    console.error('Error in base64ToBlob:', error);
    throw error;
  }
}

  async pause(): Promise<void> {
    try {
      const activePlayer = this.getCurrentPlayer();
      this._savedPosition = activePlayer.currentTime;
      activePlayer.pause();
      this.isPlaying$.next(false);
      console.log('Playback paused at position:', this._savedPosition);
    } catch (error) {
      console.error('Error pausing playback:', error);
      throw error;
    }
    if (this.currentTrack$.getValue()) {
      await this.dataService.set(`position_${this.currentTrack$.getValue()?.id}`, this.getCurrentPlayer().currentTime);
    }
  }

  async resume(position?: number): Promise<void> {
    try {
      const track = this.currentTrack$.getValue();
      if (!track) {
        console.error('No track selected to resume');
        throw new Error('No track selected to resume');
      }
      const activePlayer = this.getCurrentPlayer();
      if (position !== undefined && !isNaN(position)) {
        console.log('Resuming to specific position:', position);
        activePlayer.currentTime = position;
      }
      // previously saved position
      else if (this._savedPosition !== undefined && !isNaN(this._savedPosition)) {
        console.log('Resuming to saved position:', this._savedPosition);
        activePlayer.currentTime = this._savedPosition;
      }

      // Start playback
      try {
        await activePlayer.play();
        this.isPlaying$.next(true);
        this.startUpdates();
        console.log('Playback resumed');
      } catch (playError) {
        console.error('Error resuming playback:', playError);
        throw playError;
      }
    } catch (error) {
      console.error('Error in resume:', error);
      throw error;
    }
  }
  
  async verifyLocalTrack(trackId: string): Promise<boolean> {
    try {
      // Get track from database
      const track = await this.dataService.getTrack(trackId);
      if (!track) {
        console.error('Track not found in database:', trackId);
        return false;
      }

      console.log('Found track in database:', track);

      // Check if the file exists in filesystem
      if (track.isLocal && track.previewUrl) {
        try {
          const filePath = track.previewUrl.replace('file://', '');
          console.log('Checking if file exists at path:', filePath);

          const fileInfo = await Filesystem.stat({
            path: filePath,
            directory: Directory.Data
          });

          console.log('File exists! Size:', fileInfo.size, 'bytes');
          return true;
        } catch (fileError) {
          console.error('File does not exist at the stored path:', fileError);
          return false;
        }
      }

      return false;
    } catch (error) {
      console.error('Error verifying track:', error);
      return false;
    }
  }

  async togglePlay(): Promise<void> {
    try {
      const isPlaying = this.isPlaying$.getValue();
      const track = this.currentTrack$.getValue();

      if (!track) {
        console.error('No track selected to play');
        throw new Error('No track selected to play');
      }

      if (isPlaying) {
        // Currently playing, so pause
        await this.pause();
      } else {
        // Currently paused, so resume from saved position
        await this.resume();
      }
    } catch (error) {
      console.error('Error in togglePlay:', error);
      this.isPlaying$.next(false);
      throw error;
    }
  }

  setQueue(tracks: Track[], startIndex = 0): void {
    console.log(`Setting queue with ${tracks.length} tracks, starting at index ${startIndex}`);
    this.queue = tracks;
    this.queueIndex = startIndex;
    if (tracks.length) {
      this.play(tracks[startIndex]);
    }
  }

  next(): void {
    this.cleanup();
    if (!this.queue.length) {
      console.warn('Cannot go to next track: queue is empty');
      return;
    }
    this.queueIndex = (this.queueIndex + 1) % this.queue.length;
    console.log(`Moving to next track, new index: ${this.queueIndex}`);
    this.play(this.queue[this.queueIndex]);
  }

  previous(): void {
    this.cleanup();
    if (!this.queue.length) {
      console.log('Cannot go to previous track: queue is empty');
      return;
    }

    const activePlayer = this.getCurrentPlayer();
    if (activePlayer.currentTime > 3) {
      console.log('Current time > 3 seconds, restarting current track');
      activePlayer.currentTime = 0;
    } else {
      this.queueIndex = (this.queueIndex - 1 + this.queue.length) % this.queue.length;
      console.log(`Moving to previous track, new index: ${this.queueIndex}`);
      this.play(this.queue[this.queueIndex]);
    }
  }

  seek(time: number): void {
    console.log(`Seeking to time: ${time}`);
    const activePlayer = this.getCurrentPlayer();
    activePlayer.currentTime = time;

    // Update the saved position to match
    this._savedPosition = time;
  }

  async toggleLike(track: Track): Promise<void> {
    if (track.liked) {
      await this.dataService.removeLiked(track.id);
    } else {
      await this.dataService.addLiked(track.id);
    }
    track.liked = !track.liked;
    console.log(`Toggled like status for ${track.title}: ${track.liked}`);
  }

  // GETTERS FOR OBSERVABLE DATA
  getCurrentTrack(): Observable<Track|null> { return this.currentTrack$.asObservable(); }
  getIsPlaying(): Observable<boolean> { return this.isPlaying$.asObservable(); }
  getCurrentTime(): Observable<number> { return this.currentTime$.asObservable(); }
  getDuration(): Observable<number> { return this.duration$.asObservable(); }
  getQueue(): Track[] { return this.queue; }
  getQueueIndex(): number { return this.queueIndex; }

async addLocalTrack(file: File): Promise<Track> {
  try {
    console.log('Starting to add local track:', file.name, 'Size:', file.size);
    
    // Generate unique ID
    const id = `local-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const fileName = file.name;
    const fileExtension = fileName.split('.').pop()?.toLowerCase() || 'mp3';
    const uniqueFileName = `${id}.${fileExtension}`;
    const musicDir = 'music';
    const relativeFilePath = `${musicDir}/${uniqueFileName}`;
    let fileUri = '';

    // Save the actual file content
    if (this.platform.is('hybrid')) {
      console.log('Running on hybrid platform (Android/iOS)');
      
      // Convert to base64
      const fileArrayBuffer = await file.arrayBuffer();
      console.log('File converted to ArrayBuffer, size:', fileArrayBuffer.byteLength);
      const base64 = this.arrayBufferToBase64(fileArrayBuffer);
      console.log('File converted to base64');

      // Explicitly create the music directory first
      try {
        console.log('Ensuring music directory exists...');
        await Filesystem.mkdir({
          path: musicDir,
          directory: Directory.Data,
          recursive: true
        });
        console.log('Music directory created or verified');
      } catch (mkdirErr) {
        console.log('Music directory creation result:', mkdirErr);
        // Continue even if directory already exists (this error is expected)
      }

      // Save file with improved error handling
      try {
        console.log('Writing file to:', relativeFilePath);
        
        // Check if file exists first and delete if it does (to avoid conflicts)
        try {
          await Filesystem.deleteFile({
            path: relativeFilePath,
            directory: Directory.Data
          });
          console.log('Deleted existing file with same name');
        } catch (deleteErr) {
          // File likely doesn't exist, which is fine
          console.log('No existing file to delete');
        }
        
        // Write the file
        const savedFile = await Filesystem.writeFile({
          path: relativeFilePath,
          data: base64,
          directory: Directory.Data
        });
        
        console.log('File write result:', savedFile);
        
        // On Android, ensure we have a proper URI format
        if (this.platform.is('android')) {
          if (savedFile.uri) {
            fileUri = savedFile.uri;
            console.log('Using saved file URI:', fileUri);
          } else {
            // If no URI is returned, construct one from the path
            // Use the full path that includes the directory
            fileUri = `file://${relativeFilePath}`;
            console.log('Constructed file URI:', fileUri);
          }
        } else {
          // For iOS
          if (savedFile.uri) {
            fileUri = savedFile.uri;
          } else {
            fileUri = `file://${relativeFilePath}`;
          }
          console.log('Set fileUri to:', fileUri);
        }
      } catch (writeErr) {
        console.error('File write error details:', writeErr);
        // More detailed error for debugging
        const errorDetails = typeof writeErr === 'object' ? 
          JSON.stringify(writeErr, Object.getOwnPropertyNames(writeErr)) : String(writeErr);
        throw new Error(`Could not write file: ${errorDetails}`);
      }
    } else {
      // Web browser - create blob URL
      try {
        fileUri = URL.createObjectURL(file);
        console.log('Created blob URL for web browser:', fileUri);
      } catch (blobErr) {
        console.error('Error creating blob URL:', blobErr);
        throw new Error(`Failed to create blob URL: ${blobErr}`);
      }
    }

    if (!fileUri) {
      throw new Error('Failed to obtain a valid file URI');
    }

    // Try to extract metadata from file
    let title = fileName.replace(/\.[^/.]+$/, ''); // Remove extension
    let artist = 'Local Music';
    let album = 'My Music';
    let imageUrl = 'assets/music-bg.png';

    // Extract artist from filename if it contains a dash
    if (title.includes(' - ')) {
      const parts = title.split(' - ');
      if (parts.length >= 2) {
        artist = parts[0].trim();
        title = parts[1].trim();
      }
    }

    console.log('Creating track object with metadata');
    
    // Get audio duration with better error handling
    let duration = 0;
    try {
      duration = await this.getAudioDuration(file);
      console.log('Got audio duration:', duration);
    } catch (durationErr) {
      console.warn('Failed to get audio duration, using 0:', durationErr);
    }
    
    // Create track object
    const track: Track = {
      id,
      title,
      artist,
      album,
      duration,
      imageUrl,
      previewUrl: fileUri,
      spotifyId: '',
      liked: false,
      isLocal: true,
      localPath: relativeFilePath
    };

    console.log('Final track object:', JSON.stringify(track));

    // Save to database with better error handling
    try {
      console.log('Saving track to database');
      await this.dataService.saveLocalMusic(track, relativeFilePath);
      console.log('Track successfully saved to database');
    } catch (dbErr) {
      console.error('Database save error details:', dbErr);
      const errorDetails = typeof dbErr === 'object' ? 
        JSON.stringify(dbErr, Object.getOwnPropertyNames(dbErr)) : String(dbErr);
      throw new Error(`Could not save track info: ${errorDetails}`);
    }

    return track;
  } catch (error) {
    console.error('Complete error details in addLocalTrack:', 
      error instanceof Error ? 
      `${error.name}: ${error.message}\n${error.stack}` : 
      JSON.stringify(error));
    throw error;
  }
}

  async getAudioDuration(file: File): Promise<number> {
    return new Promise((resolve) => {
      // Create a temporary URL for the file
      const url = URL.createObjectURL(file);

      // Create a temporary audio element
      const tempAudio = new Audio();

      // Set a timeout to avoid hanging
      const timeout = setTimeout(() => {
        console.warn('Audio duration detection timeout, defaulting to 0');
        URL.revokeObjectURL(url);
        resolve(0);
      }, 3000);

      // When metadata is loaded, get the duration
      tempAudio.addEventListener('loadedmetadata', () => {
        clearTimeout(timeout);
        const duration = isNaN(tempAudio.duration) ? 0 : tempAudio.duration;
        URL.revokeObjectURL(url);
        resolve(duration);
      });

      // Handle errors
      tempAudio.addEventListener('error', () => {
        clearTimeout(timeout);
        console.warn('Error getting audio duration, using default 0');
        URL.revokeObjectURL(url);
        resolve(0);
      });

      // Set the source and load the audio
      tempAudio.preload = 'metadata';
      tempAudio.src = url;
    });
  }

  arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;

    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }

    return window.btoa(binary);
  }

  // Track existence check
  async trackExistsByName(fileName: string): Promise<boolean> {
    try {
      // Extract the title from the filename by removing the extension
      const title = fileName.replace(/\.[^/.]+$/, '');

      // Query storage for tracks with this title that are local
      const existingTracks = await this.dataService.queryTracks(
        'SELECT id FROM tracks WHERE title = ? AND is_local = 1',
        [title]
      );

      return existingTracks.length > 0;
    } catch (error) {
      console.error('Error checking for existing track:', error);
      return false;
    }
  }

cleanup(): void {
  try {
    // Stop both players
    if (this.audioPlayer) {
      this.audioPlayer.pause();
      this.audioPlayer.currentTime = 0;
    }
    
    if (this.localAudioPlayer) {
      this.localAudioPlayer.pause();
      this.localAudioPlayer.currentTime = 0;
    }

    // Revoke any existing blob URLs
    if (this._currentBlobUrl) {
      console.log('Cleaning up blob URL');
      URL.revokeObjectURL(this._currentBlobUrl);
      this._currentBlobUrl = null;
    }

    // Always clear any saved position
    this._savedPosition = undefined;

    // Stop time updates
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
}

  public async clearCurrentTrack(): Promise<void> {
    try {
      // First pause playback if it's playing
      await this.pause();

      // Reset the current track
      this.currentTrack$.next(null);
      this.isPlaying$.next(false);

      // Reset time positions
      this.currentTime$.next(0);
      this.duration$.next(0);

      // Reset audio elements and their positions
      this.audioPlayer.src = '';
      this.audioPlayer.currentTime = 0;

      this.localAudioPlayer.src = '';
      this.localAudioPlayer.currentTime = 0;

      // Clear any saved position
      if (this._savedPosition !== undefined) {
        this._savedPosition = undefined;
      }

      // Remove the last played track from storage
      await this.dataService.set('last_played_track', null);

      console.log('Track cleared, all positions reset');
    } catch (error) {
      console.error('Error clearing current track:', error);
    }
  }

  async pauseAndReset(): Promise<void> {
    try {
      // Get current player
      const activePlayer = this.getCurrentPlayer();

      // Pause playback
      activePlayer.pause();
      this.isPlaying$.next(false);

      // Reset position to beginning
      activePlayer.currentTime = 0;
      this.currentTime$.next(0);

      // Clear any saved position
      this._savedPosition = undefined;

      // Stop updates
      if (this.timerId) {
        clearInterval(this.timerId);
        this.timerId = null;
      }
    } catch (error) {
      console.error('Error pausing and resetting playback:', error);
      throw error;
    }
  }
}