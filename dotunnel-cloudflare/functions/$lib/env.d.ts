import type { RelayServiceObject } from './relay/RelayServiceObject.ts';

declare global {
  interface Env {
    RELAY_SERVICE: DurableObjectNamespace<RelayServiceObject>;
  }
}
