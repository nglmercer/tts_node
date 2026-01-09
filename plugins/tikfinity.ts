import { definePlugin, PluginContext } from "bun_plugins";
import { spawn, ChildProcess } from "child_process";
import * as path from "path";

// Referencia global al proceso webview para poder controlarlo
let webviewProcess: ChildProcess | null = null;

export default definePlugin({
    name: "tikfinity",
    version: "1.0.0",
    onLoad: async (context: PluginContext) => {
        console.log("🔌 Iniciando captura de credenciales TikFinity...");

        // Ruta al script del proceso webview
        const webviewScriptPath = path.join(__dirname, '../scripts/tikfinity-webview.ts');
        
        // Iniciamos el proceso hijo con Bun
        // Bun puede ejecutar TypeScript directamente sin necesidad de compilar
        webviewProcess = spawn('bun', ['run', webviewScriptPath], {
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: true,
            detached: false
        });

        let webviewClosed = false;

        // Escuchar la salida del proceso hijo para recibir el payload
        if (webviewProcess.stdout) {
            webviewProcess.stdout.on('data', (data) => {
                const output = data.toString();
                console.log("📨 Mensaje del proceso webview:", output);
                
                // Verificar si es el payload de TikFinity
                if (output.includes('TikFinity_PAYLOAD:')) {
                    const payload = output.replace('TikFinity_PAYLOAD:', '').trim();
                    console.log("✅ Credenciales capturadas con éxito desde proceso separado");
                    console.log("PAYLOAD:", payload);
                    
                    // Aquí puedes procesar el payload como necesites
                    // Por ejemplo, guardarlo en una variable, enviarlo a un servidor, etc.
                    
                    webviewClosed = true;
                }
            });
        }

        // Escuchar errores del proceso hijo
        if (webviewProcess.stderr) {
            webviewProcess.stderr.on('data', (data) => {
                console.error("❌ Error del proceso webview:", data.toString());
            });
        }

        // Manejar el cierre del proceso hijo
        webviewProcess.on('close', (code) => {
            console.log(`🔚 Proceso webview finalizado con código: ${code}`);
            webviewClosed = true;
            webviewProcess = null;
        });

        // Manejar errores de spawn
        webviewProcess.on('error', (error) => {
            console.error("❌ Error al iniciar proceso webview:", error);
            webviewProcess = null;
        });

        console.log("🚀 Proceso webview iniciado en segundo plano");
    },
    onUnload: () => {
        console.log("tikfinity unloaded");
        // Cerramos el proceso webview si aún está activo
        if (webviewProcess) {
            console.log("🛑 Cerrando proceso webview al descargar el plugin...");
            webviewProcess.kill();
            webviewProcess = null;
        }
    }
});