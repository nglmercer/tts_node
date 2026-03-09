// src/Discovery.ts
import { EventEmitter as EventEmitter3 } from "events";
import os3 from "os";
import crypto from "crypto";

// src/modules/Registry.ts
import { EventEmitter } from "events";

class Registry extends EventEmitter {
  services = new Map;
  update(serviceId, discoveredService) {
    const existing = this.services.get(serviceId);
    if (!existing) {
      this.services.set(serviceId, discoveredService);
      this.emit("online", discoveredService);
    } else {
      let changed = false;
      if (existing.ip !== discoveredService.ip || existing.port !== discoveredService.port || existing.version !== discoveredService.version) {
        changed = true;
      }
      this.services.set(serviceId, discoveredService);
      if (changed) {
        this.emit("online", discoveredService);
      }
    }
  }
  remove(serviceId) {
    const existing = this.services.get(serviceId);
    if (existing) {
      this.services.delete(serviceId);
      this.emit("offline", existing);
    }
  }
  get(serviceId) {
    return this.services.get(serviceId);
  }
  getAll() {
    return Array.from(this.services.values());
  }
  checkOffline(timeoutMs) {
    const now = Date.now();
    for (const [id, service] of this.services.entries()) {
      if (now - service.lastSeen > timeoutMs) {
        this.services.delete(id);
        this.emit("offline", service);
      }
    }
  }
  filter(criteria) {
    const results = [];
    for (const service of this.services.values()) {
      let match = true;
      if (criteria.id && criteria.id !== service.id)
        match = false;
      if (criteria.name && criteria.name !== service.name)
        match = false;
      if (criteria.version && criteria.version !== service.version)
        match = false;
      if (match) {
        results.push(service);
      }
    }
    return results;
  }
}

// src/modules/Network.ts
import dgram from "dgram";
import os from "os";
import { EventEmitter as EventEmitter2 } from "events";

// src/modules/debug.ts
class Logger {
  enabled = false;
  enable() {
    this.enabled = true;
  }
  disable() {
    this.enabled = false;
  }
  log(...args) {
    if (this.enabled)
      console.log(...args);
  }
  warn(...args) {
    if (this.enabled)
      console.warn(...args);
  }
  error(...args) {
    if (this.enabled)
      console.error(...args);
  }
}
var logger = new Logger;

// src/modules/Network.ts
class Network extends EventEmitter2 {
  socket = null;
  senderSocket = null;
  broadcastSocket = null;
  options;
  serviceInfo;
  port;
  constructor(serviceInfo, port, options) {
    super();
    this.serviceInfo = serviceInfo;
    this.port = port;
    this.options = options;
  }
  getLocalInterfaces() {
    const interfaces = os.networkInterfaces();
    const result = [];
    for (const name of Object.keys(interfaces)) {
      const iface = interfaces[name];
      if (!iface)
        continue;
      for (const config of iface) {
        if (config.family === "IPv4") {
          const addrParts = config.address.split(".").map(Number);
          const maskParts = config.netmask.split(".").map(Number);
          const broadcastParts = addrParts.map((a, i) => a | ~maskParts[i] & 255);
          const broadcastAddress = broadcastParts.join(".");
          result.push({
            address: config.address,
            broadcastAddress,
            internal: config.internal
          });
        }
      }
    }
    return result.length > 0 ? result : [{ address: "127.0.0.1", broadcastAddress: "127.255.255.255", internal: true }];
  }
  getLocalAddresses() {
    return this.getLocalInterfaces().map((i) => i.address);
  }
  async start() {
    const promises = [];
    if (this.options.multicastInterface) {
      promises.push(this.startMulticast(this.options.multicastInterface));
    } else {
      promises.push(this.startMulticast("0.0.0.0"));
    }
    if (this.options.enableBroadcast) {
      promises.push(this.startBroadcast());
    }
    await Promise.all(promises);
  }
  startMulticast(iface) {
    return new Promise((resolve, reject) => {
      if (this.socket) {
        try {
          this.socket.close();
        } catch (e) {}
      }
      if (this.senderSocket) {
        try {
          this.senderSocket.close();
        } catch (e) {}
      }
      this.socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
      this.senderSocket = dgram.createSocket({ type: "udp4" });
      let pendingBinds = 2;
      const checkDone = () => {
        pendingBinds--;
        if (pendingBinds === 0) {
          logger.log(`[Discovery] Multicast bound to ${iface}:${this.options.multicastPort}`);
          resolve();
        }
      };
      this.senderSocket.bind(0, () => {
        try {
          this.senderSocket.setMulticastTTL(64);
          this.senderSocket.setMulticastLoopback(true);
          this.senderSocket.setBroadcast(true);
        } catch (e) {}
        checkDone();
      });
      this.socket.on("error", (err) => {
        this.emit("error", err);
        reject(err);
      });
      this.socket.on("message", (msg, rinfo) => {
        try {
          const data = JSON.parse(msg.toString());
          this.emit("message", data, rinfo.address);
        } catch (e) {}
      });
      this.socket.bind(this.options.multicastPort, undefined, () => {
        if (!this.socket)
          return;
        try {
          this.socket.setBroadcast(true);
          this.socket.setMulticastTTL(64);
          this.socket.setMulticastLoopback(true);
          if (iface === "0.0.0.0") {
            const addresses = this.getLocalAddresses();
            for (const addr of addresses) {
              try {
                this.socket.addMembership(this.options.multicastAddress, addr);
                logger.log(`[Discovery] Added multicast membership on ${addr}`);
              } catch (e) {
                logger.log(`[Discovery] Failed to add multicast membership on ${addr}:`, e);
              }
            }
          } else {
            try {
              this.socket.addMembership(this.options.multicastAddress, iface);
            } catch (e) {
              logger.log(`[Discovery] Failed to add multicast membership on ${iface}:`, e);
            }
          }
          checkDone();
        } catch (e) {
          reject(e);
        }
      });
    });
  }
  startBroadcast() {
    return new Promise((resolve, reject) => {
      if (this.broadcastSocket) {
        try {
          this.broadcastSocket.close();
        } catch (e) {}
      }
      this.broadcastSocket = dgram.createSocket({ type: "udp4", reuseAddr: true });
      this.broadcastSocket.on("error", (err) => {
        logger.log(`[Discovery] Broadcast socket error:`, err.message);
        resolve();
      });
      this.broadcastSocket.on("message", (msg, rinfo) => {
        try {
          const data = JSON.parse(msg.toString());
          this.emit("message", data, rinfo.address);
        } catch (e) {}
      });
      this.broadcastSocket.bind(this.options.broadcastPort, undefined, () => {
        if (!this.broadcastSocket)
          return;
        try {
          this.broadcastSocket.setBroadcast(true);
          logger.log(`[Discovery] Broadcast listener bound on port ${this.options.broadcastPort}`);
        } catch (e) {}
        resolve();
      });
    });
  }
  broadcastPresence(type) {
    const message = {
      type,
      service: {
        ...this.serviceInfo,
        id: this.serviceInfo.id,
        port: this.port
      }
    };
    const buffer = Buffer.from(JSON.stringify(message));
    if (this.senderSocket) {
      if (this.options.multicastInterface) {
        try {
          this.senderSocket.setMulticastInterface(this.options.multicastInterface);
          this.senderSocket.send(buffer, 0, buffer.length, this.options.multicastPort, this.options.multicastAddress);
        } catch (e) {
          logger.log(`[Discovery] Multicast send error on ${this.options.multicastInterface}:`, e);
        }
      } else {
        const addresses = this.getLocalAddresses();
        const sendSequentially = (index) => {
          if (index >= addresses.length)
            return;
          const addr = addresses[index];
          try {
            this.senderSocket.setMulticastInterface(addr);
            this.senderSocket.send(buffer, 0, buffer.length, this.options.multicastPort, this.options.multicastAddress, (err) => {
              if (err)
                logger.log(`[Discovery] Multicast send error on ${addr}:`, err.message);
              sendSequentially(index + 1);
            });
          } catch (e) {
            logger.log(`[Discovery] Failed to send multicast on ${addr}:`, e);
            sendSequentially(index + 1);
          }
        };
        sendSequentially(0);
      }
    }
    if (this.options.enableBroadcast && this.senderSocket) {
      const ifaces = this.getLocalInterfaces();
      for (const iface of ifaces) {
        if (iface.internal)
          continue;
        try {
          this.senderSocket.send(buffer, 0, buffer.length, this.options.broadcastPort, iface.broadcastAddress, (err) => {
            if (err)
              logger.log(`[Discovery] Broadcast send error to ${iface.broadcastAddress}:`, err.message);
          });
        } catch (e) {
          logger.log(`[Discovery] Broadcast send failed to ${iface.broadcastAddress}:`, e);
        }
      }
    }
  }
  stop() {
    if (this.socket) {
      try {
        this.socket.close();
      } catch (e) {}
      this.socket = null;
    }
    if (this.senderSocket) {
      try {
        this.senderSocket.close();
      } catch (e) {}
      this.senderSocket = null;
    }
    if (this.broadcastSocket) {
      try {
        this.broadcastSocket.close();
      } catch (e) {}
      this.broadcastSocket = null;
    }
  }
}

// src/modules/ClientFactory.ts
class ClientFactory {
  filterServices;
  constructor(filterServices) {
    this.filterServices = filterServices;
  }
  createClient(criteria, loadBalancer = "round-robin") {
    let rrIndex = 0;
    return {
      get: async (path, options) => this.fetchInternal(criteria, path, { ...options, method: "GET" }, loadBalancer, () => rrIndex++),
      post: async (path, options) => this.fetchInternal(criteria, path, { ...options, method: "POST" }, loadBalancer, () => rrIndex++),
      put: async (path, options) => this.fetchInternal(criteria, path, { ...options, method: "PUT" }, loadBalancer, () => rrIndex++),
      delete: async (path, options) => this.fetchInternal(criteria, path, { ...options, method: "DELETE" }, loadBalancer, () => rrIndex++)
    };
  }
  async fetchInternal(criteria, path, options, loadBalancer, getRrIndex) {
    let services = [];
    if (typeof criteria === "string") {
      services = this.filterServices({ name: criteria });
      if (services.length === 0) {
        services = this.filterServices({ id: criteria });
      }
    } else {
      services = this.filterServices(criteria);
    }
    if (services.length === 0) {
      const name = typeof criteria === "string" ? criteria : JSON.stringify(criteria);
      throw new Error(`Service ${name} not found`);
    }
    let target = services[0];
    if (services.length > 1) {
      if (loadBalancer === "random") {
        target = services[Math.floor(Math.random() * services.length)];
      } else if (loadBalancer === "round-robin") {
        target = services[getRrIndex() % services.length];
      }
    }
    if (!target) {
      const name = typeof criteria === "string" ? criteria : JSON.stringify(criteria);
      throw new Error(`Service ${name} not found`);
    }
    const url = `${target.schema}://${target.ip}:${target.port}${path}`;
    return fetch(url, options);
  }
}

// src/modules/NetworkScanner.ts
import net from "net";
import os2 from "os";
var IDENTITY_PATH = "/.well-known/discover";

class NetworkScanner {
  static getLocalSubnets() {
    const interfaces = os2.networkInterfaces();
    const subnets = [];
    for (const name of Object.keys(interfaces)) {
      const iface = interfaces[name];
      if (!iface)
        continue;
      for (const config of iface) {
        if (config.family === "IPv4" && !config.internal) {
          const addrParts = config.address.split(".").map(Number);
          const maskParts = config.netmask.split(".").map(Number);
          const networkParts = addrParts.map((a, i) => a & maskParts[i]);
          const prefixLen = maskParts.reduce((sum, octet) => {
            let bits = 0;
            let val = octet;
            while (val > 0) {
              bits += val & 1;
              val >>= 1;
            }
            return sum + bits;
          }, 0);
          subnets.push(`${networkParts.join(".")}/${prefixLen}`);
        }
      }
    }
    return subnets.length > 0 ? subnets : ["127.0.0.0/8"];
  }
  static parseSubnet(cidr) {
    const [network, prefixStr] = cidr.split("/");
    if (!network || !prefixStr)
      return [];
    const prefix = parseInt(prefixStr, 10);
    const parts = network.split(".").map(Number);
    if (parts.length !== 4)
      return [];
    const networkNum = (parts[0] << 24 | parts[1] << 16 | parts[2] << 8 | parts[3]) >>> 0;
    const hostBits = 32 - prefix;
    const numHosts = Math.min((1 << hostBits) - 2, 254);
    const ips = [];
    for (let i = 1;i <= numHosts; i++) {
      const ip = networkNum + i;
      ips.push(`${ip >>> 24 & 255}.${ip >>> 16 & 255}.${ip >>> 8 & 255}.${ip & 255}`);
    }
    return ips;
  }
  static tcpConnect(ip, port, timeoutMs) {
    return new Promise((resolve) => {
      const socket = new net.Socket;
      let resolved = false;
      const done = (result) => {
        if (resolved)
          return;
        resolved = true;
        socket.destroy();
        resolve(result);
      };
      socket.setTimeout(timeoutMs);
      socket.on("connect", () => done(true));
      socket.on("timeout", () => done(false));
      socket.on("error", () => done(false));
      try {
        socket.connect(port, ip);
      } catch {
        done(false);
      }
    });
  }
  static async httpProbe(ip, port, timeoutMs) {
    const baseResult = { ip, port, identified: false };
    try {
      const res = await fetch(`http://${ip}:${port}${IDENTITY_PATH}`, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Accept: "application/json" }
      });
      if (res.ok) {
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const info = await res.json();
          if (info.name || info.id) {
            const service = {
              id: info.id || `discovered-${ip}-${port}`,
              name: info.name || "unknown",
              version: info.version || "unknown",
              schema: info.schema || "http",
              ip,
              port: info.port || port,
              lastSeen: Date.now()
            };
            return { ip, port, identified: true, service };
          }
        }
      }
    } catch {}
    try {
      const res = await fetch(`http://${ip}:${port}/`, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Accept: "application/json, text/html" }
      });
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const info = await res.json();
        const name = info.name || info.service || info.appName || info.app;
        if (name) {
          const service = {
            id: info.id || `discovered-${ip}-${port}`,
            name,
            version: info.version || "unknown",
            schema: "http",
            ip,
            port,
            lastSeen: Date.now()
          };
          return { ip, port, identified: true, service };
        }
        return { ...baseResult, responseInfo: { statusCode: res.status, contentType } };
      }
      if (contentType.includes("text/html")) {
        const html = await res.text();
        const titleMatch = html.match(/<title>(.*?)<\/title>/i);
        const rawTitle = titleMatch?.[1] || "";
        if (rawTitle) {
          const service = {
            id: `web-${ip}-${port}`,
            name: rawTitle.toLowerCase().replace(/\s+/g, "-").substring(0, 50),
            version: "web",
            schema: "http",
            ip,
            port,
            lastSeen: Date.now()
          };
          return { ip, port, identified: true, service, responseInfo: { title: rawTitle } };
        }
        return { ...baseResult, responseInfo: { statusCode: res.status, contentType, title: rawTitle || undefined } };
      }
      return { ...baseResult, responseInfo: { statusCode: res.status, contentType } };
    } catch {
      return baseResult;
    }
  }
  static async scan(options = {}) {
    const {
      ports = [3000, 3001, 8080, 8000, 5000],
      connectTimeout = 500,
      probeTimeout = 2000,
      concurrency = 100,
      registerResults = true
    } = options;
    let subnets;
    if (options.subnet) {
      subnets = [options.subnet];
    } else {
      subnets = NetworkScanner.getLocalSubnets();
    }
    const targets = [];
    for (const subnet of subnets) {
      const ips = NetworkScanner.parseSubnet(subnet);
      for (const ip of ips) {
        for (const port of ports) {
          targets.push({ ip, port });
        }
      }
    }
    logger.log(`[Scanner] Scanning ${targets.length} targets across ${subnets.join(", ")}...`);
    const openPorts = [];
    for (let i = 0;i < targets.length; i += concurrency) {
      const batch = targets.slice(i, i + concurrency);
      const results = await Promise.all(batch.map(async ({ ip, port }) => {
        const isOpen = await NetworkScanner.tcpConnect(ip, port, connectTimeout);
        return { ip, port, isOpen };
      }));
      for (const r of results) {
        if (r.isOpen) {
          openPorts.push({ ip: r.ip, port: r.port });
          logger.log(`[Scanner] Open port found: ${r.ip}:${r.port}`);
        }
      }
    }
    logger.log(`[Scanner] Phase 1 complete: ${openPorts.length} open ports found`);
    if (openPorts.length === 0)
      return [];
    const scanResults = [];
    for (let i = 0;i < openPorts.length; i += concurrency) {
      const batch = openPorts.slice(i, i + concurrency);
      const results = await Promise.all(batch.map(({ ip, port }) => NetworkScanner.httpProbe(ip, port, probeTimeout)));
      scanResults.push(...results);
    }
    logger.log(`[Scanner] Phase 2 complete: ${scanResults.filter((r) => r.identified).length} identified services`);
    return scanResults;
  }
}

// src/modules/IdentityServer.ts
import http from "http";
class IdentityServer {
  server = null;
  serviceInfo;
  port;
  meta;
  constructor(serviceInfo, port, meta = {}) {
    this.serviceInfo = serviceInfo;
    this.port = port;
    this.meta = meta;
  }
  getIdentity() {
    return {
      id: this.serviceInfo.id,
      name: this.serviceInfo.name,
      version: this.serviceInfo.version,
      schema: this.serviceInfo.schema || "http",
      port: this.port,
      ...this.meta
    };
  }
  middleware() {
    return (req, res, next) => {
      if (req.url === IDENTITY_PATH && req.method === "GET") {
        const body = JSON.stringify(this.getIdentity());
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          "Access-Control-Allow-Origin": "*"
        });
        res.end(body);
        return;
      }
      if (next)
        next();
    };
  }
  async startStandalone(listenPort) {
    const port = listenPort || this.port;
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        if (req.url === IDENTITY_PATH && req.method === "GET") {
          const body = JSON.stringify(this.getIdentity());
          res.writeHead(200, {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
            "Access-Control-Allow-Origin": "*"
          });
          res.end(body);
        } else {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not Found");
        }
      });
      this.server.on("error", (err) => {
        if (err.code === "EADDRINUSE") {
          logger.log(`[Identity] Port ${port} already in use, identity endpoint not started`);
          resolve();
        } else {
          reject(err);
        }
      });
      this.server.listen(port, "0.0.0.0", () => {
        logger.log(`[Identity] Listening on http://0.0.0.0:${port}${IDENTITY_PATH}`);
        resolve();
      });
    });
  }
  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}

// src/Discovery.ts
function generateServiceId(name) {
  const random = crypto.randomBytes(4).toString("hex");
  const hostname = os3.hostname().replace(/[^a-zA-Z0-9]/g, "-").substring(0, 8);
  const prefix = name ? `${name}-` : "service";
  return `${prefix}-${hostname}-${random}`;
}

class Discovery extends EventEmitter3 {
  serviceInfo;
  port;
  options;
  registry;
  network;
  clientFactory;
  identityServer = null;
  heartbeatTimer = null;
  checkOfflineTimer = null;
  processHooksSet = false;
  onProcessExit;
  constructor(serviceInfo, port, options = {}) {
    super();
    const serviceId = serviceInfo.id || generateServiceId(serviceInfo.name);
    this.serviceInfo = {
      id: serviceId,
      name: serviceInfo.name,
      version: serviceInfo.version,
      schema: serviceInfo.schema || "http"
    };
    this.port = port;
    this.options = {
      multicastAddress: options.multicastAddress || "239.255.255.250",
      multicastInterface: options.multicastInterface || "",
      multicastPort: options.multicastPort || 54321,
      broadcastPort: options.broadcastPort || 54322,
      heartbeatInterval: options.heartbeatInterval || 5000,
      offlineTimeout: options.offlineTimeout || 15000,
      setupHooks: options.setupHooks !== undefined ? options.setupHooks : true,
      enableBroadcast: options.enableBroadcast !== undefined ? options.enableBroadcast : true,
      enableIdentityEndpoint: options.enableIdentityEndpoint !== undefined ? options.enableIdentityEndpoint : true
    };
    this.registry = new Registry;
    this.network = new Network(this.serviceInfo, this.port, this.options);
    this.clientFactory = new ClientFactory(this.filter.bind(this));
    this.onProcessExit = () => {
      this.stop();
      process.exit();
    };
    this.setupEvents();
  }
  setupEvents() {
    this.registry.on("online", (service) => this.emit("online", service));
    this.registry.on("offline", (service) => this.emit("offline", service));
    this.network.on("error", (err) => this.emit("error", err));
    this.network.on("message", (msg, senderIp) => this.handleMessage(msg, senderIp));
  }
  async start() {
    await this.network.start();
    if (this.options.enableIdentityEndpoint && this.port > 0) {
      this.identityServer = new IdentityServer(this.serviceInfo, this.port);
      await this.identityServer.startStandalone();
    }
    this.network.broadcastPresence("hello");
    this.startTimers();
    if (this.options.setupHooks && !this.processHooksSet) {
      this.setupProcessHooks();
    }
  }
  handleMessage(msg, senderIp) {
    if (!msg || !msg.service)
      return;
    if (msg.service.id === this.serviceInfo.id)
      return;
    if (msg.type === "goodbye") {
      this.registry.remove(msg.service.id);
      return;
    }
    const discoveredService = {
      ...msg.service,
      ip: senderIp,
      lastSeen: Date.now()
    };
    this.registry.update(msg.service.id, discoveredService);
    if (msg.type === "hello") {
      this.network.broadcastPresence("heartbeat");
    }
  }
  startTimers() {
    this.heartbeatTimer = setInterval(() => {
      this.network.broadcastPresence("heartbeat");
    }, this.options.heartbeatInterval);
    this.checkOfflineTimer = setInterval(() => {
      this.registry.checkOffline(this.options.offlineTimeout);
    }, 1000);
  }
  async scan(options = {}) {
    const results = await NetworkScanner.scan(options);
    const registerResults = options.registerResults !== false;
    if (registerResults) {
      for (const result of results) {
        if (result.service) {
          this.registry.update(result.service.id, result.service);
        } else {
          const service = {
            id: `scan-${result.ip}-${result.port}`,
            name: result.identified || "unknown",
            ip: result.ip,
            port: result.port,
            schema: "http",
            lastSeen: Date.now()
          };
          this.registry.update(service.id, service);
        }
      }
    }
    return results;
  }
  filter(criteria) {
    return this.registry.filter(criteria);
  }
  setupProcessHooks() {
    process.on("SIGINT", this.onProcessExit);
    process.on("SIGTERM", this.onProcessExit);
    this.processHooksSet = true;
  }
  removeProcessHooks() {
    if (this.processHooksSet) {
      process.removeListener("SIGINT", this.onProcessExit);
      process.removeListener("SIGTERM", this.onProcessExit);
      this.processHooksSet = false;
    }
  }
  stop() {
    this.network.broadcastPresence("goodbye");
    if (this.heartbeatTimer)
      clearInterval(this.heartbeatTimer);
    if (this.checkOfflineTimer)
      clearInterval(this.checkOfflineTimer);
    if (this.options.setupHooks) {
      this.removeProcessHooks();
    }
    this.network.stop();
    if (this.identityServer) {
      this.identityServer.stop();
      this.identityServer = null;
    }
  }
  createClient(criteria, loadBalancer) {
    return this.clientFactory.createClient(criteria, loadBalancer);
  }
  getIdentityMiddleware() {
    if (!this.identityServer) {
      this.identityServer = new IdentityServer(this.serviceInfo, this.port);
    }
    return this.identityServer.middleware();
  }
  getInternalRegistry() {
    return this.registry;
  }
  getServiceId() {
    return this.serviceInfo.id;
  }
}
export {
  Registry,
  NetworkScanner,
  IdentityServer,
  Discovery
};
