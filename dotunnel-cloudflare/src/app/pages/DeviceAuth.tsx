"use client";

import { Banner } from "@cloudflare/kumo/components/banner";
import { Button } from "@cloudflare/kumo/components/button";
import { Input } from "@cloudflare/kumo/components/input";
import { Label } from "@cloudflare/kumo/components/label";
import { Surface } from "@cloudflare/kumo/components/surface";
import { Text } from "@cloudflare/kumo/components/text";
import { useEffect, useState } from "react";
import type { SessionUser } from "#app/auth/session.ts";
import {
  authorizeDeviceCode,
  type DeviceCodeInfo,
  denyDeviceCode,
  verifyDeviceCode,
} from "#app/functions/device.ts";

type DeviceAuthPageProps = {
  user: SessionUser;
  initialCode?: string;
};

export function DeviceAuthPage({ user, initialCode }: DeviceAuthPageProps) {
  return (
    <div className="min-h-screen bg-kumo-base flex items-center justify-center p-4">
      <DeviceAuthForm user={user} initialCode={initialCode} />
    </div>
  );
}

function DeviceAuthForm({ user, initialCode }: DeviceAuthPageProps) {
  const [code, setCode] = useState(initialCode || "");
  const [deviceCode, setDeviceCode] = useState<DeviceCodeInfo | null>(null);
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "denied" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);

  // Auto-verify if initial code is provided
  useEffect(() => {
    if (initialCode) {
      handleVerify();
    }
  }, [initialCode]);

  async function handleVerify() {
    if (!code.trim()) {
      setError("Please enter a code");
      return;
    }

    setStatus("loading");
    setError(null);

    try {
      const result = await verifyDeviceCode(code.toUpperCase());

      if (!result) {
        setError("Invalid or expired code. Please try again.");
        setStatus("error");
        return;
      }

      if (result.status !== "pending") {
        setError("This code has already been used.");
        setStatus("error");
        return;
      }

      if (new Date(result.expiresAt) < new Date()) {
        setError(
          "This code has expired. Please request a new one in your CLI.",
        );
        setStatus("error");
        return;
      }

      setDeviceCode(result);
      setStatus("idle");
    } catch (err) {
      console.error("Failed to verify code:", err);
      setError("Failed to verify code. Please try again.");
      setStatus("error");
    }
  }

  async function handleAuthorize() {
    if (!deviceCode) return;

    setStatus("loading");
    setError(null);

    try {
      const success = await authorizeDeviceCode(deviceCode.userCode);

      if (success) {
        setStatus("success");
      } else {
        setError("Failed to authorize. The code may have expired.");
        setStatus("error");
      }
    } catch (err) {
      console.error("Failed to authorize:", err);
      setError("Failed to authorize. Please try again.");
      setStatus("error");
    }
  }

  async function handleDeny() {
    if (!deviceCode) return;

    setStatus("loading");
    setError(null);

    try {
      await denyDeviceCode(deviceCode.userCode);
      setStatus("denied");
    } catch (err) {
      console.error("Failed to deny:", err);
      setError("Failed to deny. Please try again.");
      setStatus("error");
    }
  }

  function handleReset() {
    setCode("");
    setDeviceCode(null);
    setStatus("idle");
    setError(null);
  }

  // Success state
  if (status === "success") {
    return (
      <Surface className="w-full max-w-md rounded-lg border border-kumo-line">
        <div className="p-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-kumo-success/10">
            <svg
              className="h-6 w-6 text-kumo-success"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              role="img"
              aria-label="Success"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <Text variant="heading3">Device Authorized</Text>
          <p className="mt-2 text-kumo-subtle">
            You can now close this page and return to your CLI.
          </p>
        </div>
      </Surface>
    );
  }

  // Denied state
  if (status === "denied") {
    return (
      <Surface className="w-full max-w-md rounded-lg border border-kumo-line">
        <div className="p-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-kumo-danger/10">
            <svg
              className="h-6 w-6 text-kumo-danger"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              role="img"
              aria-label="Denied"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
          <Text variant="heading3">Access Denied</Text>
          <p className="mt-2 text-kumo-subtle">
            You have denied this authorization request.
          </p>
        </div>
      </Surface>
    );
  }

  // Confirm authorization (after code verification)
  if (deviceCode) {
    return (
      <Surface className="w-full max-w-md rounded-lg border border-kumo-line">
        <div className="p-6 text-center space-y-2">
          <Text variant="heading3">Authorize Device</Text>
          <Text variant="secondary">
            A device is requesting access to your DOtunnel account.
          </Text>
        </div>
        <div className="px-6 pb-6 space-y-6">
          <div className="rounded-lg border border-kumo-line bg-kumo-base p-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-kumo-subtle">Client</span>
                <span className="font-mono">{deviceCode.clientId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-kumo-subtle">Account</span>
                <span>{user.email}</span>
              </div>
              {deviceCode.scope && (
                <div className="flex justify-between">
                  <span className="text-kumo-subtle">Scope</span>
                  <span>{deviceCode.scope}</span>
                </div>
              )}
            </div>
          </div>

          {error && <Banner variant="error">{error}</Banner>}

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleDeny}
              disabled={status === "loading"}
            >
              Deny
            </Button>
            <Button
              className="flex-1"
              onClick={handleAuthorize}
              disabled={status === "loading"}
            >
              {status === "loading" ? "Authorizing..." : "Authorize"}
            </Button>
          </div>

          <button
            type="button"
            onClick={handleReset}
            className="w-full text-center text-sm text-kumo-subtle hover:text-kumo-default"
          >
            Enter a different code
          </button>
        </div>
      </Surface>
    );
  }

  // Code entry form
  return (
    <Surface className="w-full max-w-md rounded-lg border border-kumo-line">
      <div className="p-6 text-center space-y-2">
        <Text variant="heading3">Enter Device Code</Text>
        <Text variant="secondary">
          Enter the code shown in your CLI to authorize the device.
        </Text>
      </div>
      <div className="px-6 pb-6 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="code">Device Code</Label>
          <Input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABCD1234"
            className="text-center text-2xl font-mono tracking-widest"
            maxLength={8}
            autoComplete="off"
            autoFocus
          />
        </div>

        {error && <Banner variant="error">{error}</Banner>}

        <Button
          className="w-full"
          onClick={handleVerify}
          disabled={status === "loading" || code.length < 8}
        >
          {status === "loading" ? "Verifying..." : "Continue"}
        </Button>

        <p className="text-center text-xs text-kumo-subtle">
          Signed in as {user.email}
        </p>
      </div>
    </Surface>
  );
}
