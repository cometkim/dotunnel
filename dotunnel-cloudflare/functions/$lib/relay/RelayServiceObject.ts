import { DurableObject } from 'cloudflare:workers';

export class RelayServiceObject extends DurableObject<Env> {
  #state: DurableObjectState;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);

    this.#state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const connections = this.#state.getWebSockets();
  }
}
