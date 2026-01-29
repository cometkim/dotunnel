import { env } from "cloudflare:workers";
import type { RouteMiddleware } from "rwsdk/router";

export function configLoader(): RouteMiddleware {
  return ({ cf }) => {
    if (env.CONFIG_V1) {
    }
  };
}
