import type { IPlugin, PluginContext } from "bun_plugins";
import type { ActionHandler } from "trigger_system/node";
import { ActionRegistry } from "trigger_system/node";
import { Discovery } from "./discover/index.js";
import { PLUGIN_NAMES, HELPERS } from "../constants.js";
import { TTScleaner } from "./cleaner.js";
/**
 * Plugin que expone:
 * - ActionRegistry para registrar acciones
 * - HelperRegistry para helpers/utilidades
 * - ServiceRegistry para registrar servicios descubiertos
 * - Discovery para descubrimiento de servicios UDP
 * 
 * Los servicios deben ser agregados por los plugins que lo necesiten,
 * no hay servicios por defecto.
 */

export interface ServiceInfo {
  id?: string;
  name: string;
  version?: string;
  schema?: string;
  ip?: string;
  port?: number;
}

export interface DiscoveryOptions {
  multicastAddress?: string;
  multicastInterface?: string;
  multicastPort?: number;
  heartbeatInterval?: number;
  offlineTimeout?: number;
  setupHooks?: boolean;
}

/**
 * Registro simple para funciones auxiliares (helpers/vars)
 */
export class HelperRegistry {
  private static instance: HelperRegistry;
  private helpers: Record<string, Function> = {};

  private constructor() {}

  static getInstance(): HelperRegistry {
    if (!HelperRegistry.instance) {
      HelperRegistry.instance = new HelperRegistry();
    }
    return HelperRegistry.instance;
  }

  register(name: string, fn: Function) {
    this.helpers[name] = fn;
    console.log(`[HelperRegistry] Helper registrado: ${name}`);
  }

  getHelpers() {
    return { ...this.helpers };
  }

  get(name: string): Function | undefined {
    return this.helpers[name];
  }
}

export class ActionRegistryPlugin implements IPlugin {
  name = PLUGIN_NAMES.ACTION_REGISTRY;
  version = "1.0.0";

  public discovery: Discovery | null = null;

  public get registry() {
    return ActionRegistry.getInstance();
  }

  public get helperRegistry() {
    return HelperRegistry.getInstance();
  }

  get Helpers() {
    return this.helperRegistry.getHelpers();
  }
  constructor() {
    console.log(`${this.name} v${this.version}`);
    this.getSharedApi = this.getSharedApi.bind(this);
    this.discovery = this.initDiscovery({ name: 'plugin-b-service', version: '1.0.0' }, 0);
  }

  onLoad(context: PluginContext) {
    console.log(`${this.name} v${this.version} onLoad`);
    this.helperRegistry.register(HELPERS.LAST, () => {
      const history = TTScleaner.getMessageHistory();
      const lastItem = history[history.length - 1];
      return lastItem ? lastItem.cleanedText : "";
    });

    this.helperRegistry.register(HELPERS.CLEAN, (t: any) => {
      return TTScleaner.cleanOnly(String(t || ""));
    });
  }

  onUnload() {
    console.log(`${this.name} v${this.version} onUnload`);
    // Limpiar discovery al descargar
    if (this.discovery) {
      this.discovery.stop();
      this.discovery = null;
    }
  }

  /**
   * Inicializa el sistema de descubrimiento de servicios
   * @param serviceInfo Información del servicio local
   * @param port Puerto para el descubrimiento
   * @param options Opciones de configuración
   */
  initDiscovery(serviceInfo: ServiceInfo, port: number, options?: DiscoveryOptions): Discovery {
    if (this.discovery) {
      console.warn('[Discovery] Ya está inicializado, deteniendo anterior...');
      this.discovery.stop();
    }

    this.discovery = new Discovery(serviceInfo, port, options);
    console.log(`[Discovery] Inicializado: ${serviceInfo.name} en puerto ${port}`);
    this.discovery.start()
    return this.discovery;
  }

  /**
   * Obtiene la instancia de Discovery activa
   */
  getDiscovery(): Discovery | null {
    return this.discovery;
  }
  register(name: string, fn: ActionHandler) {
    this.registry.register(name, fn);
  }
  getSharedApi() {
    const registry = this.registry;
    const helperRegistry = this.helperRegistry;

    return {
      // Action Registry
      register: registry.register.bind(registry),
      get: registry.get.bind(registry),
      registry: registry,
      
      // Helper Registry
      registerHelper: helperRegistry.register.bind(helperRegistry),
      getHelpers: helperRegistry.getHelpers.bind(helperRegistry),
      getHelper: helperRegistry.get.bind(helperRegistry),
    };
  }
}

// Instancia singleton del plugin
export const actionRegistryPlugin = new ActionRegistryPlugin();
