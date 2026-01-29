"use server";

import { getRequestInfo } from "rwsdk/worker";
import {
  authorizeDeviceCode as _authorizeDeviceCode,
  denyDeviceCode as _denyDeviceCode,
  getDeviceCodeByUserCode,
} from "#app/auth/device-flow.ts";
import type { AppContext } from "../../worker.tsx";

export type DeviceCodeInfo = {
  userCode: string;
  clientId: string;
  scope: string | null;
  expiresAt: string;
  status: string;
};

function requireUserId(): number {
  const { ctx } = getRequestInfo() as { ctx: AppContext };
  if (!ctx.user) {
    throw new Error("Authentication required");
  }
  return ctx.user.id;
}

export async function verifyDeviceCode(
  userCode: string,
): Promise<DeviceCodeInfo | null> {
  const result = await getDeviceCodeByUserCode(userCode);

  if (!result) {
    return null;
  }

  return {
    userCode: result.userCode,
    clientId: result.clientId,
    scope: result.scope,
    expiresAt: result.expiresAt.toISOString(),
    status: result.status,
  };
}

export async function authorizeDeviceCode(userCode: string): Promise<boolean> {
  const userId = requireUserId();
  return _authorizeDeviceCode(userCode, userId);
}

export async function denyDeviceCode(userCode: string): Promise<boolean> {
  return _denyDeviceCode(userCode);
}
