import type { IPlugin, PluginContext } from "bun_plugins";
import type { ActionHandler } from "trigger_system/node";
import { ActionRegistry } from "trigger_system/node";
// Importing Discovery and also the new types from your built library
import { Discovery, type ScanOptions, type ScanResult } from "./discover/index.js"; 
import { PLUGIN_NAMES, HELPERS } from "../constants.js";
import { TTScleaner } from "./cleaner.js";

/**
 * Plugin que expone:
 * - ActionRegistry para registrar acciones
 * - HelperRegistry para helpers/utilidades
 * - ServiceRegistry para registrar servicios descubiertos
 * - Discovery para descubrimiento de servicios UDP y Active Scanning
 */

export interface ServiceInfo {
  id?: string;
  name: string;
  version?: string;
  schema?: string;
  ip?: string;
  port?: number;
}

// UPDATE: Added the new Discovery options for Broadcast and Identity
export interface DiscoveryOptions {
  multicastAddress?: string;
  multicastInterface?: string;
  multicastPort?: number;
  broadcastPort?: number;          
  enableBroadcast?: boolean;       
  enableIdentityEndpoint?: boolean;
  heartbeatInterval?: number;
  offlineTimeout?: number;
  setupHooks?: boolean;
}

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
    
    // UPDATE: Initialize Discovery. We disable hooks here since your plugin manager
    // might handle the lifecycle. `enableIdentityEndpoint: false` because port is 0.
    this.discovery = this.initDiscovery(
      { name: 'plugin-b-service', version: '1.0.0' }, 
      0, 
      { setupHooks: false, enableIdentityEndpoint: false }
    );
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
    if (this.discovery) {
      this.discovery.stop();
      this.discovery = null;
    }
  }

  /**
   * Inicializa el sistema de descubrimiento de servicios
   */
  initDiscovery(serviceInfo: ServiceInfo, port: number, options?: DiscoveryOptions): Discovery {
    if (this.discovery) {
      console.warn('[Discovery] Ya está inicializado, deteniendo anterior...');
      this.discovery.stop();
    }

    this.discovery = new Discovery(serviceInfo as any, port, options);
    console.log(`[Discovery] Inicializado: ${serviceInfo.name} en puerto ${port}`);
    
    // Empezamos a escuchar broadcasts / multicast
    this.discovery.start().catch(e => console.error('[Discovery] Error starting:', e));
    this.scanNetwork().catch(e => console.error('[Discovery] Error scanning:', e));
    return this.discovery;
  }

  getDiscovery(): Discovery | null {
    return this.discovery;
  }

  async scanNetwork(options?: ScanOptions): Promise<ScanResult[]> {
    if (!this.discovery) {
        console.warn('[Discovery] Cannot scan, discovery not initialized');
        return [];
    }
    console.log('[Discovery] Iniciando escaneo activo de red...');
    return await this.discovery.scan(options);
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

export const actionRegistryPlugin = new ActionRegistryPlugin();
