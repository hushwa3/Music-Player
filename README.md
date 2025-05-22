# Ionic Angular Music Player App

## Overview

This is a music player project built with Ionic Angular that supports both local storage playback and online streaming. The app features a modern UI design with intuitive controls and comprehensive playlist management.

## Features

### Local Storage Playback
- Scans device for music files in supported formats (AAC, MP3, WAV, OGG, FLAC, Opus)
- Extracts song metadata and displays album artwork when available
- Manages playback state with play, pause, skip, and seek functionality

### Online Streaming
- Integrates with Spotify API for music streaming
- Search functionality for finding songs, artists, and albums
- Displays album artwork and artist information from streaming services

### Playlist Management
- Create, rename, and delete playlists
- Add/remove songs from playlists
- Play all or shuffle functionality for playlists

### User Experience
- Custom animated splash screen
- Intuitive side menu navigation
- Responsive design that works on various device sizes
- Support for dark/light mode

### User Preferences
- Customizable settings for playback (shuffle, repeat)
- Audio quality selection for streaming
- Option to use mobile data for streaming
- Persist user preferences across app sessions

## Technical Implementation

### Architecture
- Service-based architecture separating business logic from UI components
- Observable pattern for real-time updates across components
- Capacitor plugins for accessing native device features

### Data Storage
- Local file system access for music files
- Capacitor Preferences for storing user settings and playlists
- Efficient data caching for improved performance

### API Integration
- HTTP client for connecting to music streaming services
- Error handling for network requests
- Proper authentication for API requests

## Getting Started

1. Install dependencies:
   ```
   npm install
   ```

2. Run the development server:
   ```
   ionic serve
   ```

3. Build for Android:
   ```
   ionic build
   npx cap sync android
   npx cap open android
   ```

## Next Steps for Enhancement

1. **Advanced Audio Features**:
   - Equalizer functionality
   - Crossfade between tracks
   - Audio normalization

2. **Social Features**:
   - Share playlists
   - Connect with other users
   - Integration with social media

3. **Offline Mode**:
   - Download songs for offline playback
   - Sync playlists across devices
   - Background audio downloading

4. **Analytics**:
   - Track listening habits
   - Recommend songs based on preferences
   - Generate listening statistics

## Technology Stack

- Ionic Framework
- Angular
- TypeScript
- Capacitor
- HTML/SCSS
- Android Studio (for native builds)
- Spotify API
