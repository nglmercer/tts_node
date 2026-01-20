import { pipeline, TextToAudioOutput, TextToAudioPipelineOptions } from '@huggingface/transformers';

// Tipado extendido para los métodos útiles que mencionaste
interface AudioOutput extends TextToAudioOutput {
    toWav(): Uint8Array;
    toBlob(): Blob;
    save(path: string): Promise<void>;
}

export class SupertonicTTS {
    private static instance: any = null;
    private readonly baseUrl = 'https://huggingface.co/onnx-community/Supertonic-TTS-2-ONNX/resolve/main/voices/';
    // FI TO F5 AND M1 TO M5
    public readonly VOICES = {
        FEMALE_1: 'F1.bin',
        FEMALE_2: 'F2.bin',
        FEMALE_3: 'F3.bin',
        FEMALE_4: 'F4.bin',
        FEMALE_5: 'F5.bin',
        MALE_1: 'M1.bin',
        MALE_2: 'M2.bin',
        MALE_3: 'M3.bin',
        MALE_4: 'M4.bin',
        MALE_5: 'M5.bin',
    };

    private defaultVoice: string;

    constructor(defaultVoice: string = 'F1.bin') {
        this.defaultVoice = `${this.baseUrl}${defaultVoice}`;
    }

    /**
     * Inicialize
     */
    private async getPipeline() {
        if (!SupertonicTTS.instance) {
            SupertonicTTS.instance = await pipeline('text-to-speech', 'onnx-community/Supertonic-TTS-2-ONNX', {
                device: 'cpu', //Unsupported device: "webgpu". Should be one of: cuda, cpu.
            });
        }
        return SupertonicTTS.instance;
    }

    /**
     * Generate audio from text
     */
    public async speak(text: string, voiceKey?: keyof typeof this.VOICES, customOptions: Partial<TextToAudioPipelineOptions> = {}): Promise<AudioOutput> {
        const tts = await this.getPipeline();
        
        const voiceUrl = voiceKey ? `${this.baseUrl}${this.VOICES[voiceKey]}` : this.defaultVoice;

        const options: TextToAudioPipelineOptions = {
            speaker_embeddings: voiceUrl,
            num_inference_steps: 5,
            speed: 1.0,
            ...customOptions
        };

        const result = await tts(text, options);
        return result as AudioOutput;
    }

    /**
     * Get available voices
     */
    public getAvailableVoices() {
        return Object.keys(this.VOICES);
    }
}


async function main() {
    const ttsApi = new SupertonicTTS('F2.bin'); // Set default voice to F2

    const text = "<es>Hola, esta es una prueba de voz local.</es>";

    try {
        console.log("Generando audio...");
        
        const audio = await ttsApi.speak(text, undefined, { speed: 1.1 });

        if (typeof window !== 'undefined') {
            const blob = audio.toBlob();
            const url = URL.createObjectURL(blob);
            new Audio(url).play();
        } else {
            await audio.save('output.wav');
            console.log("Archivo guardado como output.wav");
        }
    } catch (error) {
        console.error("Error en TTS:", error);
    }
}
main();