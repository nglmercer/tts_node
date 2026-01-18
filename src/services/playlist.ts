import {
  AudioPlayer,
  createAudioPlayer,
  isFormatSupported,
  getAudioMetadata,
} from "miniaudio_node";
import type { AudioPlayerConfig } from "miniaudio_node";

export type Track = string | Buffer;

/**
 * Playlist manager class for handling multiple audio files and buffers
 * with race condition prevention and proper state management.
 */
export class PlaylistManager {
  private player: AudioPlayer;
  private tracks: Track[] = [];
  private currentTrackIndex: number = 0;
  private isPlaying: boolean = false;
  private loop: boolean = false;

  // State management for preventing race conditions
  private isBusy: boolean = false;
  private monitorInterval: NodeJS.Timeout | null = null;
  private isStopping: boolean = false;

  // Event callbacks
  private onTrackStart?: (track: Track, index: number) => void;
  private onTrackEnd?: (
    track: Track,
    index: number,
    reason: "completed" | "manual",
  ) => void;
  private onPlaylistEnd?: () => void;

  constructor(options?: AudioPlayerConfig | undefined) {
    this.player = createAudioPlayer(options);
  }

  /**
   * Load multiple tracks into playlist
   */
  async loadTracks(tracks: Track[]): Promise<void> {
    console.log(`📚 Loading ${tracks.length} tracks into playlist...`);

    const validTracks: Track[] = [];

    for (const track of tracks) {
      if (typeof track === "string") {
        const extension = track.split(".").pop()?.toLowerCase();
        if (!extension || !isFormatSupported(extension)) {
          console.warn(`⚠️  Unsupported format or invalid extension: ${track}`);
          continue;
        }

        // Check file exists
        const fs = await import("node:fs");
        if (!fs.existsSync(track)) {
          console.warn(`⚠️  File not found: ${track}`);
          continue;
        }
        validTracks.push(track);
      } else if (Buffer.isBuffer(track)) {
        // Assume buffers are valid audio data (or let player fail later)
        validTracks.push(track);
      }
    }

    this.tracks = validTracks;
    console.log(`✅ Loaded ${this.tracks.length} valid tracks`);
  }

  /**
   * Add a single track to the end of the playlist
   */
  async addTrack(track: Track): Promise<void> {
    // Validate track
    if (typeof track === "string") {
      const extension = track.split(".")?.pop()?.toLowerCase();
      if (!extension || !isFormatSupported(extension)) {
        throw new Error(`Unsupported format or invalid extension: ${track}`);
      }

      const fs = await import("node:fs");
      if (!fs.existsSync(track)) {
        throw new Error(`File not found: ${track}`);
      }
    }

    this.tracks.push(track);
    console.log(`✅ Added track. Total: ${this.tracks.length}`);
  }

  /**
   * Play current track with lock mechanism to prevent race conditions
   */
  async playCurrentTrack(): Promise<void> {
    // If already busy processing, skip this call to avoid race conditions
    if (this.isBusy) {
      console.log("⏭️  Operation in progress, skipping duplicate call");
      return;
    }

    if (this.tracks.length === 0) {
      throw new Error("No tracks loaded");
    }

    this.isBusy = true;
    this.isStopping = false;

    try {
      // Clean up any existing monitoring
      this.clearMonitorInterval();

      const currentTrack = this.tracks[this.currentTrackIndex];
      if (!currentTrack) return;

      const trackLabel =
        typeof currentTrack === "string"
          ? currentTrack
          : `Buffer Track #${this.currentTrackIndex + 1}`;
      console.log(
        `🎵 Playing track ${this.currentTrackIndex + 1}/${this.tracks.length}: ${trackLabel}`,
      );

      // Stop any currently playing audio immediately (with small delay for clean transition)
      if (this.isPlaying) {
        await this.player.stop();
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      try {
        if (typeof currentTrack === "string") {
          if (!currentTrack || currentTrack.trim() === "") {
            console.error("❌ Empty string track path");
            return;
          }

          await this.player.loadFile(currentTrack);

          // Show track metadata for files
          const metadata = getAudioMetadata(currentTrack);
          console.log("📋 Track info:", metadata);
        } else if (Buffer.isBuffer(currentTrack)) {
          if (currentTrack.length === 0) {
            console.error("❌ Buffer track is empty");
            return;
          }

          // Convert Buffer to number[] as required by miniaudio_node loadBuffer
          const bufferData = Array.from(currentTrack);
          await this.player.loadBuffer(bufferData);
          console.log("📋 Track info: [Memory Buffer]");
        } else {
          console.error("❌ Invalid track format");
          return;
        }

        // Play the track
        await this.player.play();
        this.isPlaying = true;

        // Notify listeners
        if (this.onTrackStart) {
          this.onTrackStart(currentTrack, this.currentTrackIndex);
        }

        // Start monitoring playback with proper interval management
        this.monitorPlayback();
      } catch (error) {
        console.error("❌ Failed to play track:", error);
        this.isPlaying = false;
        throw error;
      }
    } finally {
      this.isBusy = false;
    }
  }

  /**
   * Monitor playback and advance to next track when needed
   */
  private monitorPlayback(): void {
    this.clearMonitorInterval();

    // Longer interval to reduce CPU usage and avoid conflicts (500ms is reasonable)
    const checkIntervalMs = 500;

    this.monitorInterval = setInterval(() => {
      if (this.isStopping) {
        return;
      }

      try {
        // Check actual player state (async but miniaudio might be synchronous)
        const isPlayerReallyPlaying = this.player.isPlaying();

        // Track finished naturally
        if (!isPlayerReallyPlaying && this.isPlaying) {
          this.clearMonitorInterval();
          this.isPlaying = false;

          // Notify listeners about track completion
          const currentTrack = this.tracks[this.currentTrackIndex];
          if (currentTrack && this.onTrackEnd) {
            this.onTrackEnd(currentTrack, this.currentTrackIndex, "completed");
          }

          // Use setImmediate to avoid promise chaining in interval callback
          setImmediate(() => {
            if (!this.isStopping) {
              this.nextTrack();
            }
          });
        }
      } catch (error) {
        console.error("[Monitor] Error checking player state:", error);
        this.clearMonitorInterval();
        this.isPlaying = false;
      }
    }, checkIntervalMs);
  }

  /**
   * Clear monitoring interval safely
   */
  private clearMonitorInterval(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }

  /**
   * Play next track in playlist
   */
  async nextTrack(): Promise<void> {
    // Wait for any ongoing operation to complete
    if (this.isBusy) {
      console.log("⏭️  Operation in progress, delaying next track");
      await this.waitForIdle(1000);
    }

    this.currentTrackIndex++;

    if (this.currentTrackIndex >= this.tracks.length) {
      if (this.loop) {
        this.currentTrackIndex = 0;
        console.log("🔄 Looping playlist");
      } else {
        console.log("✅ End of playlist reached");
        this.isPlaying = false;
        this.clearMonitorInterval();

        if (this.onPlaylistEnd) {
          this.onPlaylistEnd();
        }
        return;
      }
    }

    // Small delay to prevent immediate successive calls and allow clean transition
    await new Promise((resolve) => setTimeout(resolve, 50));
    await this.playCurrentTrack();
  }

  /**
   * Play previous track
   */
  async previousTrack(): Promise<void> {
    if (this.isBusy) {
      await this.waitForIdle(1000);
    }

    this.currentTrackIndex = Math.max(0, this.currentTrackIndex - 1);
    await this.playCurrentTrack();
  }

  /**
   * Go to specific track index (0-based)
   */
  async goToTrack(index: number): Promise<void> {
    if (index < 0 || index >= this.tracks.length) {
      throw new Error(`Invalid track index: ${index}`);
    }

    if (this.isBusy) {
      await this.waitForIdle(1000);
    }

    this.currentTrackIndex = index;
    await this.playCurrentTrack();
  }

  /**
   * Pause current playback
   */
  pause(): void {
    this.player.pause();
    this.isPlaying = false;
    this.clearMonitorInterval();
    console.log("⏸️  Paused");
  }

  /**
   * Resume playback
   */
  async resume(): Promise<void> {
    if (this.isBusy) {
      await this.waitForIdle(1000);
    }

    if (!this.isPlaying && this.tracks.length > 0) {
      this.player.play();
      this.isPlaying = true;
      this.monitorPlayback();
      console.log("▶️  Resumed");
    }
  }

  /**
   * Stop playback and reset to beginning
   */
  async stop(): Promise<void> {
    this.isStopping = true;
    this.clearMonitorInterval();

    try {
      this.player.stop();
    } catch (error) {
      console.error("Error stopping player:", error);
    }

    this.isPlaying = false;
    this.currentTrackIndex = 0;
    this.isBusy = false;
    console.log("⏹️  Stopped");
  }

  /**
   * Skip current track immediately
   */
  async skip(): Promise<void> {
    await this.stop();
    await this.nextTrack();
  }

  /**
   * Remove track from playlist
   */
  removeTrack(index: number): Track | null {
    if (index < 0 || index >= this.tracks.length) {
      return null;
    }

    const removed = this.tracks.splice(index, 1)[0];

    // Adjust current index if needed
    if (index < this.currentTrackIndex) {
      this.currentTrackIndex--;
    } else if (index === this.currentTrackIndex && this.isPlaying) {
      // If removing currently playing track, stop and go to next
      this.stop();
      if (
        this.tracks.length > 0 &&
        this.currentTrackIndex >= this.tracks.length
      ) {
        this.currentTrackIndex = Math.max(0, this.tracks.length - 1);
      }
    }

    console.log(
      `🗑️  Removed track at index ${index}. Remaining: ${this.tracks.length}`,
    );
    return removed || null;
  }

  /**
   * Set looping mode
   */
  setLoop(enabled: boolean): void {
    this.loop = enabled;
    console.log(`🔄 Loop mode: ${enabled ? "ON" : "OFF"}`);
  }

  /**
   * Set volume (0.0 to 1.0)
   */
  setVolume(volume: number): void {
    this.player.setVolume(volume);
    console.log(`🔊 Volume set to ${volume}`);
  }

  /**
   * Get volume
   */
  getVolume(): number {
    return this.player.getVolume();
  }

  /**
   * Get current track index
   */
  getCurrentIndex(): number {
    return this.currentTrackIndex;
  }

  /**
   * Get total tracks
   */
  getTotalTracks(): number {
    return this.tracks.length;
  }

  /**
   * Get playing state
   */
  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * Get playlist status
   */
  getStatus() {
    const currentTrack = this.tracks[this.currentTrackIndex];
    return {
      totalTracks: this.tracks.length,
      currentTrack: this.currentTrackIndex + 1,
      currentTrackPath:
        typeof currentTrack === "string" ? currentTrack : "Buffer",
      isPlaying: this.isPlaying,
      loop: this.loop,
      volume: this.player.getVolume(),
      isBusy: this.isBusy,
      isStopping: this.isStopping,
    };
  }

  /**
   * Event handlers
   */
  on(
    event: "trackStart",
    callback: (track: Track, index: number) => void,
  ): void;
  on(
    event: "trackEnd",
    callback: (
      track: Track,
      index: number,
      reason: "completed" | "manual",
    ) => void,
  ): void;
  on(event: "playlistEnd", callback: () => void): void;
  on(event: string, callback: any): void {
    switch (event) {
      case "trackStart":
        this.onTrackStart = callback;
        break;
      case "trackEnd":
        this.onTrackEnd = callback;
        break;
      case "playlistEnd":
        this.onPlaylistEnd = callback;
        break;
    }
  }

  /**
   * Remove event handlers
   */
  removeListener(event: "trackStart" | "trackEnd" | "playlistEnd"): void {
    switch (event) {
      case "trackStart":
        this.onTrackStart = undefined;
        break;
      case "trackEnd":
        this.onTrackEnd = undefined;
        break;
      case "playlistEnd":
        this.onPlaylistEnd = undefined;
        break;
    }
  }

  /**
   * Cleanup resources - call this when done using the playlist
   */
  async dispose(): Promise<void> {
    await this.stop();
    this.clearMonitorInterval();
    this.tracks = [];
    this.onTrackStart = undefined;
    this.onTrackEnd = undefined;
    this.onPlaylistEnd = undefined;
    console.log("🗑️  Playlist resources disposed");
  }

  /**
   * Helper to wait until the manager is idle
   */
  private waitForIdle(timeoutMs: number = 2000): Promise<void> {
    return new Promise((resolve) => {
      const start = Date.now();
      const check = () => {
        if (!this.isBusy) {
          resolve();
        } else if (Date.now() - start > timeoutMs) {
          console.warn("Timeout waiting for idle");
          resolve();
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });
  }
}
