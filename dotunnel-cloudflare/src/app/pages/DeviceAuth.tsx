"use client";

import { useEffect, useState } from "react";
import type { SessionUser } from "#app/auth/session.ts";
import { Alert, AlertDescription } from "#app/components/ui/alert.tsx";
import { Button } from "#app/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#app/components/ui/card.tsx";
import { Input } from "#app/components/ui/input.tsx";
import { Label } from "#app/components/ui/label.tsx";
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
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
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
      <Card className="w-full max-w-md border-zinc-800 bg-zinc-900">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
            <svg
              className="h-6 w-6 text-green-500"
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
          <CardTitle className="text-white">Device Authorized</CardTitle>
          <CardDescription className="text-zinc-400">
            You can now close this page and return to your CLI.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Denied state
  if (status === "denied") {
    return (
      <Card className="w-full max-w-md border-zinc-800 bg-zinc-900">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
            <svg
              className="h-6 w-6 text-red-500"
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
          <CardTitle className="text-white">Access Denied</CardTitle>
          <CardDescription className="text-zinc-400">
            You have denied this authorization request.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Confirm authorization (after code verification)
  if (deviceCode) {
    return (
      <Card className="w-full max-w-md border-zinc-800 bg-zinc-900">
        <CardHeader className="text-center">
          <CardTitle className="text-white">Authorize Device</CardTitle>
          <CardDescription className="text-zinc-400">
            A device is requesting access to your DOtunnel account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-500">Client</span>
                <span className="text-white font-mono">
                  {deviceCode.clientId}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Account</span>
                <span className="text-white">{user.email}</span>
              </div>
              {deviceCode.scope && (
                <div className="flex justify-between">
                  <span className="text-zinc-500">Scope</span>
                  <span className="text-white">{deviceCode.scope}</span>
                </div>
              )}
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

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
            className="w-full text-center text-sm text-zinc-500 hover:text-zinc-300"
          >
            Enter a different code
          </button>
        </CardContent>
      </Card>
    );
  }

  // Code entry form
  return (
    <Card className="w-full max-w-md border-zinc-800 bg-zinc-900">
      <CardHeader className="text-center">
        <CardTitle className="text-white">Enter Device Code</CardTitle>
        <CardDescription className="text-zinc-400">
          Enter the code shown in your CLI to authorize the device.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="code" className="text-zinc-300">
            Device Code
          </Label>
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

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button
          className="w-full"
          onClick={handleVerify}
          disabled={status === "loading" || code.length < 8}
        >
          {status === "loading" ? "Verifying..." : "Continue"}
        </Button>

        <p className="text-center text-xs text-zinc-500">
          Signed in as {user.email}
        </p>
      </CardContent>
    </Card>
  );
}
