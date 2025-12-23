import { PluginManager } from "bun_plugins";
import { ActionRegistry } from "trigger_system/node";
import { join } from "node:path";
import { ActionRegistryPlugin } from "./RegisterPlugin";

/**
 * Gestor de plugins personalizado para TTS
 * Extiende PluginManager para asegurar que el ActionRegistryPlugin esté siempre cargado
 */
export class TtsPluginManager extends PluginManager {
  constructor() {
    super();
    // Registrar el plugin de registro de acciones automáticamente
    this.register(new ActionRegistryPlugin());
    console.log("📦 TtsPluginManager: ActionRegistryPlugin registrado automáticamente");
  }

  /**
   * Carga plugins desde el directorio configurado por defecto
   */
  async loadDefaultPlugins() {
    const pluginsDir = join(process.cwd(), "plugins");
    await this.loadPluginsFromDirectory(pluginsDir);
    return this.listPlugins();
  }
}