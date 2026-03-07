/**
 * Ejemplo de plugin que utiliza el sistema de descubrimiento de servicios
 * 
 * Este plugin demuestra cómo:
 * 1. Inicializar el discovery
 * 2. Registrar servicios manualmente
 * 3. Escuchar eventos de servicios descubiertos
 * 4. Realizar peticiones HTTP a servicios descubiertos usando bun fetch
 */

import type { IPlugin, PluginContext } from "bun_plugins";
import { getRegistryPlugin,type ActionRegistryApi } from "./Interface/ActionRegistryApi";
import type { Discovery } from "src/services/discover";
export class ExampleDiscoveryPlugin implements IPlugin {
  name = "ExampleDiscoveryPlugin";
  version = "1.0.0";
  constructor() {
    console.log(`${this.name} v${this.version}`);
  }

  async onLoad(context: PluginContext) {
    console.log(`${this.name} v${this.version} onLoad`);
    const registryPlugin = await getRegistryPlugin(context);
    console.log("registryPlugin", typeof registryPlugin);
    if (!registryPlugin) return;
    // Registrar servicios manualmente (ejemplo)
    // this.registerServices(registryPlugin);

    // Registrar acciones de ejemplo
    this.registerActions(registryPlugin);
  }

  onUnload() {
    console.log(`${this.name} v${this.version} onUnload`);
  }

  /**
   * Registra acciones de ejemplo que usan los servicios
   */
  private registerActions(registryPlugin: ActionRegistryApi) {
    registryPlugin.register('SEND_WEBHOOK',async (action, _context) => {
      const method = String(action.params?.method || 'GET');
      const body = action.params?.body;
      const discovery = registryPlugin.discovery as Discovery;
      const name = 'overlay-service';
      const service = discovery.createClient({name});
      const allServices = discovery.getInternalRegistry().getAll();
      if (discovery.filter({ name }).length === 0){
        console.log("webhook, services:",allServices)
        return { error: "no service", allServices }
      }
      console.log("SEND_WEBHOOK", action,allServices);  
      ///webhook/alert
      const url = `/webhook/alert`;
      try {
        const fetchOptions: RequestInit = {
          method,
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-By': 'ExampleDiscoveryPlugin'
          }
        };

        if (body && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
          fetchOptions.body = JSON.stringify(body);
        }

        const response = await service.post(url, fetchOptions);
        if (!response.ok) {
          const msg = { error: "response not ok", response }
          console.log("response",response)
          return msg
        }
        const data = await response.text();
        
        return {
          status: response.status,
          body: data
        };
      } catch (error) {
        return { error: String(error) };
      }
    })

    // Acción para listar servicios disponibles
    registryPlugin.register('EXAMPLE_LIST_SERVICES', async (_action, _context) => {
      const discovery = registryPlugin.discovery as Discovery;
      return { services: discovery.getInternalRegistry().getAll() };
    });

  }
}

// Exportar instancia
export const exampleDiscoveryPlugin = new ExampleDiscoveryPlugin();
