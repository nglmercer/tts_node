/**
 * Interfaz por defecto para el retorno
 */
export interface SocketIoEvent<T = any> {
  eventName: string;
  data: T;
}

/**
 * Parsea un mensaje de Socket.io 42 con mapeo de llaves opcional.
 * * @param message - El string crudo del socket (ej: '42["chat", {}]')
 * @param keys - (Opcional) Diccionario para renombrar las llaves de salida
 */
export function parseSocketIo42Message<
  T = any, 
  E extends string = 'eventName', 
  D extends string = 'data'
>(
  message: string,
  keys?: { event: E; data: D }
): { [K in E]: string } & { [K in D]: T } | null {
  
  // Validamos el prefijo del protocolo Socket.io
  if (!message || !message.startsWith('42')) {
    return null;
  }

  try {
    // Extraemos y parseamos el JSON (saltando el "42")
    const parsed = JSON.parse(message.substring(2));

    if (Array.isArray(parsed) && parsed.length >= 1) {
      // Definimos las llaves que usaremos: las proveídas o las de SocketIoEvent por defecto
      const eventKey = keys?.event ?? ('eventName' as E);
      const dataKey = keys?.data ?? ('data' as D);

      return {
        [eventKey]: parsed[0],
        [dataKey]: parsed.length > 1 ? parsed[1] : null
      } as { [K in E]: string } & { [K in D]: T };
    }
  } catch (error) {
    console.error("Error parsing Socket.io message:", error);
  }

  return null;
}