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
import { actionRegistryPlugin } from "../src/services/RegisterPlugin";

export class ExampleDiscoveryPlugin implements IPlugin {
  name = "ExampleDiscoveryPlugin";
  version = "1.0.0";

  private api = actionRegistryPlugin.getSharedApi();
  private servers: any[] = [];

  constructor() {
    console.log(`${this.name} v${this.version}`);
    this.getSharedApi = this.getSharedApi.bind(this);
  }

  async onLoad(context: PluginContext) {
    console.log(`${this.name} v${this.version} onLoad`);

    // Iniciar servidores de prueba
    await this.startTestServers();

    // Registrar servicios manualmente (ejemplo)
    this.registerExampleServices();

    // Registrar acciones de ejemplo
    this.registerExampleActions();

    // Probar las acciones
    await this.testActions();
  }

  onUnload() {
    console.log(`${this.name} v${this.version} onUnload`);
    // Detener servidores
    this.servers.forEach(server => server.stop?.());
    this.servers = [];
  }

  /**
   * Inicia servidores de prueba usando bun serve
   */
  private async startTestServers() {
    console.log('[Example] Iniciando servidores de prueba...');

    // Servidor de usuarios en puerto 3001
    const usersServer = Bun.serve({
      port: 3001,
      fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === '/api/users') {
          return Response.json([
            { id: 1, name: 'John Doe', email: 'john@example.com' },
            { id: 2, name: 'Jane Doe', email: 'jane@example.com' }
          ]);
        }
        return Response.json({ error: 'Not found' }, { status: 404 });
      }
    });
    this.servers.push(usersServer);
    console.log(`[Example] Users server: http://127.0.0.1:${usersServer.port}`);

    // Servidor de productos en puerto 3002
    const productsServer = Bun.serve({
      port: 3002,
      fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === '/api/products') {
          return Response.json([
            { id: 1, name: 'Product A', price: 99.99 },
            { id: 2, name: 'Product B', price: 149.99 }
          ]);
        }
        return Response.json({ error: 'Not found' }, { status: 404 });
      }
    });
    this.servers.push(productsServer);
    console.log(`[Example] Products server: http://127.0.0.1:${productsServer.port}`);

    // Servidor de pedidos en puerto 3003
    const ordersServer = Bun.serve({
      port: 3003,
      fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === '/api/orders') {
          return Response.json([
            { id: 1, userId: 1, total: 99.99, status: 'completed' },
            { id: 2, userId: 2, total: 149.99, status: 'pending' }
          ]);
        }
        return Response.json({ error: 'Not found' }, { status: 404 });
      }
    });
    this.servers.push(ordersServer);
    console.log(`[Example] Orders server: http://127.0.0.1:${ordersServer.port}`);
  }

  /**
   * Registra servicios de ejemplo
   * En un caso real, estos vendrían del discovery UDP o serían registrados por otros plugins
   */
  private registerExampleServices() {
    // Registrar servicios manualmente con IP y puerto
    this.api.registerService('users', {
      name: 'users',
      version: '1.0.0',
      schema: 'http',
      ip: '127.0.0.1',
      port: 3001
    });

    this.api.registerService('products', {
      name: 'products',
      version: '1.0.0',
      schema: 'http',
      ip: '127.0.0.1',
      port: 3002
    });

    this.api.registerService('orders', {
      name: 'orders',
      version: '1.0.0',
      schema: 'http',
      ip: '127.0.0.1',
      port: 3003
    });

    console.log('[Example] Servicios registrados manualmente');
  }

  /**
   * Registra acciones de ejemplo que usan los servicios
   */
  private registerExampleActions() {
    const registry = this.api.registry;

    // Acción para obtener usuarios
    registry.register('EXAMPLE_GET_USERS', async (_action, _context) => {
      const service = this.api.getService('users');
      if (!service) {
        return { error: 'Servicio users no encontrado' };
      }

      const url = `http://${service.ip}:${service.port}/api/users`;
      
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        const data = await response.text();
        return {
          status: response.status,
          body: data
        };
      } catch (error) {
        return { error: String(error) };
      }
    });

    // Acción para obtener productos
    registry.register('EXAMPLE_GET_PRODUCTS', async (_action, _context) => {
      const service = this.api.getService('products');
      if (!service) {
        return { error: 'Servicio products no encontrado' };
      }

      const url = `http://${service.ip}:${service.port}/api/products`;
      
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        const data = await response.text();
        return {
          status: response.status,
          body: data
        };
      } catch (error) {
        return { error: String(error) };
      }
    });

    // Acción genérica para forward a cualquier servicio registrado
    registry.register('EXAMPLE_FORWARD', async (action, _context) => {
      const serviceName = String(action.params?.service || '');
      const path = String(action.params?.path || '/');
      const method = String(action.params?.method || 'GET');
      const body = action.params?.body;

      const service = this.api.getService(serviceName);
      if (!service) {
        return { error: `Servicio ${serviceName} no encontrado` };
      }

      const port = service.port || 3000;
      const url = `http://${service.ip}:${port}${path}`;
      
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

        const response = await fetch(url, fetchOptions);
        const data = await response.text();
        
        return {
          status: response.status,
          body: data
        };
      } catch (error) {
        return { error: String(error) };
      }
    });

    // Acción para listar servicios disponibles
    registry.register('EXAMPLE_LIST_SERVICES', async (_action, _context) => {
      const services = this.api.getAllServices();
      return { services };
    });

    console.log('[Example] Acciones registradas');
  }

  /**
   * Prueba las acciones registradas - usa fetch directamente
   */
  private async testActions() {
    console.log('\n=== Probando acciones con bun fetch ===\n');

    // Test 1: Listar servicios
    console.log('1. Listando servicios...');
    const services = this.api.getAllServices();
    console.log('   Servicios:', JSON.stringify(services, null, 2));

    // Test 2: Obtener usuarios
    console.log('\n2. Obteniendo usuarios...');
    const usersService = this.api.getService('users');
    if (usersService) {
      try {
        const response = await fetch(`http://${usersService.ip}:${usersService.port}/api/users`);
        const data = await response.text();
        console.log('   Resultado:', JSON.stringify(JSON.parse(data), null, 2));
      } catch (error) {
        console.log('   Error:', String(error));
      }
    }

    // Test 3: Obtener productos
    console.log('\n3. Obteniendo productos...');
    const productsService = this.api.getService('products');
    if (productsService) {
      try {
        const response = await fetch(`http://${productsService.ip}:${productsService.port}/api/products`);
        const data = await response.text();
        console.log('   Resultado:', JSON.stringify(JSON.parse(data), null, 2));
      } catch (error) {
        console.log('   Error:', String(error));
      }
    }

    // Test 4: Forward genérico a orders
    console.log('\n4. Forward a orders...');
    const ordersService = this.api.getService('orders');
    if (ordersService) {
      try {
        const response = await fetch(`http://${ordersService.ip}:${ordersService.port}/api/orders`);
        const data = await response.text();
        console.log('   Resultado:', JSON.stringify(JSON.parse(data), null, 2));
      } catch (error) {
        console.log('   Error:', String(error));
      }
    }

    // Test 5: Post a orders (prueba con body)
    console.log('\n5. POST a orders (crear orden)...');
    if (ordersService) {
      try {
        const response = await fetch(`http://${ordersService.ip}:${ordersService.port}/api/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: 1, items: [{ productId: 1, quantity: 2 }] })
        });
        const data = await response.text();
        console.log('   Resultado:', JSON.stringify(JSON.parse(data), null, 2));
      } catch (error) {
        console.log('   Error:', String(error));
      }
    }

    console.log('\n=== Pruebas completadas ===\n');
  }

  getSharedApi() {
    return {
      ...this.api,
      // API específica del plugin
      getServices: () => this.api.getAllServices(),
      forward: async (serviceName: string, path: string, method: string = 'GET', body?: any) => {
        const service = this.api.getService(serviceName);
        if (!service) {
          throw new Error(`Servicio ${serviceName} no encontrado`);
        }
        const url = `http://${service.ip}:${service.port}${path}`;
        return fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          ...(body ? { body: JSON.stringify(body) } : {})
        });
      }
    };
  }
}

// Exportar instancia
export const exampleDiscoveryPlugin = new ExampleDiscoveryPlugin();
