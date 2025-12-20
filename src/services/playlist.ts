import { AudioPlayer, initializeAudio,getSupportedFormats,createAudioPlayer,isFormatSupported,getAudioMetadata } from "miniaudio_node";
import type { AudioPlayerConfig } from "miniaudio_node";
/**
 * Playlist manager class for handling multiple audio files
 */
export class PlaylistManager {
  private player: AudioPlayer;
  private tracks: string[] = [];
  private currentTrackIndex: number = 0;
  private isPlaying: boolean = false;
  private loop: boolean = false;

  constructor(options?: AudioPlayerConfig | undefined) {
    this.player = createAudioPlayer(options);
  }

  /**
   * Load multiple tracks into playlist
   */
  async loadTracks(tracks: string[]): Promise<void> {
    console.log(`📚 Loading ${tracks.length} tracks into playlist...`);

    // Validate all tracks exist and are supported
    for (const track of tracks) {
      const extension = track.split(".").pop()?.toLowerCase();
      if (!extension || !isFormatSupported(extension)) {
        throw new Error(`Unsupported format: ${track}`);
      }

      // Check file exists
      const fs = await import("node:fs");
      if (!fs.existsSync(track)) {
        console.warn(`⚠️  File not found: ${track}`);
      }
    }

    this.tracks = tracks.filter((track) => {
      const fs = require("node:fs");
      return fs.existsSync(track);
    });

    console.log(`✅ Loaded ${this.tracks.length} valid tracks`);
  }

  /**
   * Play current track
   */
  async playCurrentTrack(): Promise<void> {
    if (this.tracks.length === 0) {
      throw new Error("No tracks loaded");
    }

    const currentTrack = this.tracks[this.currentTrackIndex];
    console.log(
      `🎵 Playing track ${this.currentTrackIndex + 1}/${this.tracks.length}: ${currentTrack}`,
    );

    try {
      await this.player.loadFile(currentTrack!);
      await this.player.play();
      this.isPlaying = true;

      // Show track metadata
      const metadata = getAudioMetadata(currentTrack!);
      console.log("📋 Track info:", metadata);

      // Auto-advance to next track when current one finishes
      this.monitorPlayback();
    } catch (error) {
      console.error("❌ Failed to play track:", error);
      this.isPlaying = false;
    }
  }

  /**
   * Monitor playback and advance to next track
   */
  private monitorPlayback(): void {
    const checkInterval = setInterval(() => {
      if (!this.player.isPlaying() && this.isPlaying) {
        clearInterval(checkInterval);
        this.isPlaying = false;
        this.nextTrack();
      }
    }, 1000);
  }

  /**
   * Play next track in playlist
   */
  async nextTrack(): Promise<void> {
    this.currentTrackIndex++;

    if (this.currentTrackIndex >= this.tracks.length) {
      if (this.loop) {
        this.currentTrackIndex = 0;
        console.log("🔄 Looping playlist");
      } else {
        console.log("✅ End of playlist reached");
        return;
      }
    }

    await this.playCurrentTrack();
  }

  /**
   * Play previous track
   */
  async previousTrack(): Promise<void> {
    this.currentTrackIndex = Math.max(0, this.currentTrackIndex - 1);
    await this.playCurrentTrack();
  }

  /**
   * Pause current playback
   */
  pause(): void {
    this.player.pause();
    this.isPlaying = false;
  }

  /**
   * Resume playback
   */
  async resume(): Promise<void> {
    if (!this.isPlaying && this.tracks.length > 0) {
      await this.player.play();
      this.isPlaying = true;
      this.monitorPlayback();
    }
  }

  /**
   * Stop playback and reset
   */
  async stop(): Promise<void> {
    await this.player.stop();
    this.isPlaying = false;
    this.currentTrackIndex = 0;
  }

  /**
   * Set looping mode
   */
  setLoop(enabled: boolean): void {
    this.loop = enabled;
    console.log(`🔄 Loop mode: ${enabled ? "ON" : "OFF"}`);
  }

  /**
   * Get playlist status
   */
  getStatus() {
    return {
      totalTracks: this.tracks.length,
      currentTrack: this.currentTrackIndex + 1,
      currentTrackPath: this.tracks[this.currentTrackIndex] || null,
      isPlaying: this.isPlaying,
      loop: this.loop,
      volume: this.player.getVolume(),
    };
  }
}