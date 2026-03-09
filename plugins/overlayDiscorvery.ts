/**
 * Ejemplo de plugin que utiliza el sistema de descubrimiento de servicios
 * 
 * Este plugin demuestra cómo:
 * 1. Inicializar el discovery
 * 2. Registrar servicios manualmente
 * 3. Escuchar eventos de servicios descubiertos
 * 4. Realizar peticiones HTTP a servicios descubiertos usando bun fetch
 * 5. Implementar cache con timeout y auto-refresh
 */

import type { IPlugin, PluginContext } from "bun_plugins";
import { getRegistryPlugin,type ActionRegistryApi } from "./Interface/ActionRegistryApi";
import type { Discovery } from "src/services/discover";
export class OverlayDiscoveryPlugin implements IPlugin {
  name = "OverlayDiscoveryPlugin";
  version = "1.0.0";
  
  // Cache configuration
  private readonly CACHE_TTL_MS = 120000; // 2 minute cache TTL
  private readonly CACHE_REFRESH_INTERVAL_MS = 60000; // 1 minute between refreshes
  private readonly REQUEST_TIMEOUT_MS = 10000; // 10 seconds request timeout
  private readonly MAX_RETRIES = 2;
  
  // Cache state
  private cache: Map<string, { services: any[]; timestamp: number }> = new Map();
  private refreshTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    console.log(`${this.name} v${this.version}`);
  }

  async onLoad(context: PluginContext) {
    console.log(`${this.name} v${this.version} onLoad`);
    const registryPlugin = await getRegistryPlugin(context);
    console.log("registryPlugin", typeof registryPlugin);
    if (!registryPlugin) return;

    // Registrar acciones de ejemplo
    this.registerActions(registryPlugin);
  }

  onUnload() {
    console.log(`${this.name} v${this.version} onUnload`);
    // Clean up all timers
    this.refreshTimers.forEach(timer => clearInterval(timer));
    this.refreshTimers.clear();
    this.cache.clear();
  }

  /**
   * Check if cache is valid for a service
   */
  private isCacheValid(name: string): boolean {
    const cached = this.cache.get(name);
    if (!cached) return false;
    return Date.now() - cached.timestamp < this.CACHE_TTL_MS;
  }

  /**
   * Get cached services or scan if not cached/invalid
   */
  private async getServicesWithCache(discovery: Discovery, name: string, forceRefresh = false): Promise<any[]> {
    // Check if cache is valid
    if (!forceRefresh && this.isCacheValid(name)) {
      const cached = this.cache.get(name);
      if (cached && cached.services.length > 0) {
        console.log(`[Cache] Using cached services for '${name}'`);
        return cached.services;
      }
    }

    // Cache invalid or not exists, scan for services
    console.log(`[Cache] Scanning for services: '${name}'`);
    await discovery.scan();
    const services = discovery.filter({ name });
    
    // Update cache
    this.cache.set(name, {
      services,
      timestamp: Date.now()
    });

    // Setup auto-refresh if not already done
    this.setupAutoRefresh(discovery, name);

    return services;
  }

  /**
   * Setup auto-refresh timer for a service
   */
  private setupAutoRefresh(discovery: Discovery, name: string): void {
    if (this.refreshTimers.has(name)) {
      return; // Already has a timer
    }

    const timer = setInterval(async () => {
      console.log(`[Cache] Auto-refreshing services for '${name}'`);
      await this.getServicesWithCache(discovery, name, true);
    }, this.CACHE_REFRESH_INTERVAL_MS);

    this.refreshTimers.set(name, timer);
  }

  /**
   * Invalidate cache for a service (call when response is not ok)
   */
  private invalidateCache(name: string): void {
    console.log(`[Cache] Invalidating cache for '${name}'`);
    this.cache.delete(name);
  }

  /**
   * Make HTTP request with timeout
   */
  private async fetchWithTimeout(
    url: string, 
    options: RequestInit, 
    timeoutMs = this.REQUEST_TIMEOUT_MS
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      return response;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Registra acciones de ejemplo que usan los servicios
   */
  private registerActions(registryPlugin: ActionRegistryApi) {
    registryPlugin.register('OVERLAY_WEBHOOK',async (action, _context) => {
      const method = String(action.params?.method || 'GET');
      const body = action.params?.body;
      const discovery = registryPlugin.discovery as Discovery;
      const name = 'overlay-framework';
      
      // Use cached services with auto-refresh
      let services = await this.getServicesWithCache(discovery, name);
      
      // If no services found, force a fresh scan
      if (services.length === 0) {
        console.log("[Overlay] No cached services, forcing scan");
        await discovery.scan();
        services = discovery.filter({ name });
        
        // Update cache with fresh results
        this.cache.set(name, {
          services,
          timestamp: Date.now()
        });
      }

      const allServices = discovery.getInternalRegistry().getAll();
      console.log("OVERLAY_WEBHOOK", action, allServices);  
      
      ///webhook/alert
      const url = `/webhook/alert`;
      
      let lastError: Error | null = null;
      
      // Try request with retries
      for (let attempt = 0; attempt <= this.MAX_RETRIES; attempt++) {
        try {
          // Get fresh services from cache for each attempt
          const currentServices = this.cache.get(name)?.services || services;
          
          if (currentServices.length === 0) {
            // Cache was invalidated, scan again
            console.log(`[Overlay] Cache invalidated, rescanning (attempt ${attempt + 1})`);
            await this.getServicesWithCache(discovery, name, true);
            continue;
          }

          const service = discovery.createClient({ name });
          
          const fetchOptions: RequestInit = {
            method,
            headers: {
              'Content-Type': 'application/json',
              'X-Forwarded-By': 'OverlayDiscoveryPlugin'
            }
          };

          if (body && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
            fetchOptions.body = JSON.stringify(body);
          }

          // Use timeout for the request
          const response = await this.fetchWithTimeout(
            `http://${currentServices[0].ip}:${currentServices[0].port}${url}`,
            fetchOptions,
            this.REQUEST_TIMEOUT_MS
          );
          
          if (!response.ok) {
            const msg = { error: "response not ok", status: response.status, attempt: attempt + 1 };
            console.log("response not ok", response.status, "attempt:", attempt + 1);
            
            // Invalidate cache on non-ok response
            this.invalidateCache(name);
            
            // If we have retries left, continue
            if (attempt < this.MAX_RETRIES) {
              lastError = new Error(`Response not ok: ${response.status}`);
              // Wait a bit before retry
              await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
              continue;
            }
            
            return msg;
          }
          
          const data = await response.text();
          
          return {
            status: response.status,
            body: data
          };
        } catch (error) {
          lastError = error as Error;
          console.log("Request error:", error, "attempt:", attempt + 1);
          
          // Invalidate cache on error
          this.invalidateCache(name);
          
          if (attempt < this.MAX_RETRIES) {
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
            continue;
          }
        }
      }
      
      return { error: lastError?.message || "Max retries exceeded" };
    })

    // Acción para listar servicios disponibles
    registryPlugin.register('EXAMPLE_LIST_SERVICES', async (_action, _context) => {
      const discovery = registryPlugin.discovery as Discovery;
      return { services: discovery.getInternalRegistry().getAll() };
    });

  }
}

// Exportar instancia
export const exampleDiscoveryPlugin = new OverlayDiscoveryPlugin();
