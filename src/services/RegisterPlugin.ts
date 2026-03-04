import type { IPlugin, PluginContext } from "bun_plugins";
import { ActionRegistry } from "trigger_system/node";
import { Discovery } from "./discover/index.js";

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
class HelperRegistry {
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

/**
 * Registry simple para servicios descubiertos
 */
class ServiceRegistry {
  private static instance: ServiceRegistry;
  private services: Map<string, ServiceInfo> = new Map();

  private constructor() {}

  static getInstance(): ServiceRegistry {
    if (!ServiceRegistry.instance) {
      ServiceRegistry.instance = new ServiceRegistry();
    }
    return ServiceRegistry.instance;
  }

  register(name: string, info: ServiceInfo) {
    this.services.set(name, info);
    console.log(`[ServiceRegistry] Servicio registrado: ${name}`);
  }

  get(name: string): ServiceInfo | undefined {
    return this.services.get(name);
  }

  getAll(): ServiceInfo[] {
    return Array.from(this.services.values());
  }

  unregister(name: string) {
    this.services.delete(name);
    console.log(`[ServiceRegistry] Servicio eliminado: ${name}`);
  }
}

export class ActionRegistryPlugin implements IPlugin {
  name = "ActionRegistryPlugin";
  version = "1.0.0";

  private _discovery: Discovery | null = null;

  private get registry() {
    return ActionRegistry.getInstance();
  }

  private get helperRegistry() {
    return HelperRegistry.getInstance();
  }

  private get serviceRegistry() {
    return ServiceRegistry.getInstance();
  }

  constructor() {
    console.log(`${this.name} v${this.version}`);
    this.getSharedApi = this.getSharedApi.bind(this);
  }

  onLoad(context: PluginContext) {
    console.log(`${this.name} v${this.version} onLoad`);
  }

  onUnload() {
    console.log(`${this.name} v${this.version} onUnload`);
    // Limpiar discovery al descargar
    if (this._discovery) {
      this._discovery.stop();
      this._discovery = null;
    }
  }

  /**
   * Inicializa el sistema de descubrimiento de servicios
   * @param serviceInfo Información del servicio local
   * @param port Puerto para el descubrimiento
   * @param options Opciones de configuración
   */
  initDiscovery(serviceInfo: ServiceInfo, port: number, options?: DiscoveryOptions): Discovery {
    if (this._discovery) {
      console.warn('[Discovery] Ya está inicializado, deteniendo anterior...');
      this._discovery.stop();
    }

    this._discovery = new Discovery(serviceInfo, port, options);
    console.log(`[Discovery] Inicializado: ${serviceInfo.name} en puerto ${port}`);
    return this._discovery;
  }

  /**
   * Obtiene la instancia de Discovery activa
   */
  getDiscovery(): Discovery | null {
    return this._discovery;
  }

  getSharedApi() {
    const registry = this.registry;
    const helperRegistry = this.helperRegistry;
    const serviceRegistry = this.serviceRegistry;
    const discovery = this._discovery;

    return {
      // Action Registry
      register: registry.register.bind(registry),
      get: registry.get.bind(registry),
      registry: registry,
      
      // Helper Registry
      registerHelper: helperRegistry.register.bind(helperRegistry),
      getHelpers: helperRegistry.getHelpers.bind(helperRegistry),
      getHelper: helperRegistry.get.bind(helperRegistry),
      
      // Service Registry
      registerService: serviceRegistry.register.bind(serviceRegistry),
      getService: serviceRegistry.get.bind(serviceRegistry),
      getAllServices: serviceRegistry.getAll.bind(serviceRegistry),
      unregisterService: serviceRegistry.unregister.bind(serviceRegistry),
      
      // Discovery
      initDiscovery: this.initDiscovery.bind(this),
      getDiscovery: () => discovery,
    };
  }

  get Helpers() {
    return this.helperRegistry.getHelpers();
  }
}

// Instancia singleton del plugin
export const actionRegistryPlugin = new ActionRegistryPlugin();
