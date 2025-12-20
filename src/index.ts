import { TTSService } from "./services/audio";
import { PlaylistManager } from "./services/playlist";
import path from "path";

async function main() {
  try {
    const tts = new TTSService("./output");
    const playlist = new PlaylistManager();

    console.log("🗣️ Generating speech...");
    
    // Generate a few messages
    const messages = [
      { text: "Welcome to the Edge TTS system.", file: "welcome" },
      { text: "This is a demonstration of the playlist manager.", file: "demo" },
      { text: "Thank you for listening.", file: "thanks" }
    ];

    const audioFiles: string[] = [];

    for (const msg of messages) {
      console.log(`Generating: "${msg.text}"`);
      const filePath = await tts.synthesize(
        msg.text, 
        'en-US-AriaNeural', 
        msg.file
      );
      audioFiles.push(filePath);
      console.log(`Saved to: ${filePath}`);
    }

    console.log("\n🎵 Starting playlist...");
    
    // Load tracks into playlist
    await playlist.loadTracks(audioFiles);

    // Play
    await playlist.playCurrentTrack();

    // Keep process alive to let audio play
    // Since playlist.playCurrentTrack might return immediately after starting playback (it's async but just starts it)
    // Actually, looking at playlist.ts:
    // playCurrentTrack awaits player.play().
    // player.play() in miniaudio usually just starts playback.
    // However, the PlaylistManager has `monitorPlayback` which uses setInterval.
    // If the main script exits, the interval clears? No, Node/Bun keeps running if there are active handles.
    // setInterval is an active handle.
    
    // However, we might want to wait for user input or just let it run.
    console.log("Press Ctrl+C to exit.");

  } catch (error) {
    console.error("An error occurred:", error);
  }
}

main();
