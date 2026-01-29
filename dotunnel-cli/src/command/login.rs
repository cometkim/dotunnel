use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use std::sync::Arc;
use reqwest_hickory_resolver::HickoryResolver;

use crate::config::{Config, Credentials, ProfileConfig, ProfileCredentials};

const CLIENT_ID: &str = "dotunnel-cli";
const DEFAULT_SERVICE_URL: &str = "http://localhost:5173";
const POLL_INTERVAL: Duration = Duration::from_secs(5);

#[derive(Debug, clap::Args)]
pub struct Args {
    /// The DOtunnel service URL
    #[arg(long, env = "DOTUNNEL_SERVICE_URL")]
    service_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct DeviceCodeResponse {
    device_code: String,
    user_code: String,
    verification_uri: String,
    verification_uri_complete: String,
    expires_in: u64,
    interval: u64,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum TokenResponse {
    Success(TokenSuccess),
    Error(TokenError),
}

#[derive(Debug, Deserialize)]
struct TokenSuccess {
    access_token: String,
    #[allow(dead_code)]
    token_type: String,
}

#[derive(Debug, Deserialize)]
struct TokenError {
    error: String,
    error_description: String,
}

#[derive(Debug, Serialize)]
struct DeviceCodeRequest {
    client_id: String,
}

#[derive(Debug, Serialize)]
struct TokenRequest {
    grant_type: String,
    device_code: String,
    client_id: String,
}

pub async fn execute(args: &Args, profile: &str) -> Result<()> {
    let mut config = Config::load().unwrap_or_default();

    // Determine service URL
    let service_url = args
        .service_url
        .clone()
        .or_else(|| config.get_profile(profile).map(|p| p.service_url.clone()))
        .unwrap_or_else(|| DEFAULT_SERVICE_URL.to_string());

    // Check if already logged in
    let credentials = Credentials::load().unwrap_or_default();
    if credentials.get_profile(profile).is_some() {
        println!("You are already logged in to profile '{}'. Use 'dotunnel logout' first to log out.", profile);
        return Ok(());
    }

    println!("Logging in to DOtunnel service at {}", service_url);
    println!();

    // Step 1: Request device code
    let resolver = Arc::new(HickoryResolver::default());
    let client = reqwest::Client::builder()
        .dns_resolver(resolver)
        .build()?;
    let device_code_url = format!("{}/_api/device/code", service_url);

    let response = client
        .post(&device_code_url)
        .json(&DeviceCodeRequest {
            client_id: CLIENT_ID.to_string(),
        })
        .send()
        .await
        .context("Failed to request device code")?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        bail!("Failed to request device code: {} - {}", status, body);
    }

    let device_response: DeviceCodeResponse = response
        .json()
        .await
        .context("Failed to parse device code response")?;

    // Display user code and instructions
    println!("Please visit the following URL to authorize this device:");
    println!();
    println!("  {}", device_response.verification_uri_complete);
    println!();
    println!("Or go to {} and enter code:", device_response.verification_uri);
    println!();
    println!("  {}", device_response.user_code);
    println!();

    // Try to open browser automatically
    if let Err(e) = open::that(&device_response.verification_uri_complete) {
        tracing::debug!("Failed to open browser: {}", e);
    }

    println!("Waiting for authorization...");

    // Step 2: Poll for token
    let token_url = format!("{}/_api/device/token", service_url);
    let poll_interval = Duration::from_secs(device_response.interval.max(POLL_INTERVAL.as_secs()));
    let deadline = std::time::Instant::now() + Duration::from_secs(device_response.expires_in);

    loop {
        if std::time::Instant::now() > deadline {
            bail!("Device code expired. Please try again.");
        }

        tokio::time::sleep(poll_interval).await;

        let response = client
            .post(&token_url)
            .json(&TokenRequest {
                grant_type: "urn:ietf:params:oauth:grant-type:device_code".to_string(),
                device_code: device_response.device_code.clone(),
                client_id: CLIENT_ID.to_string(),
            })
            .send()
            .await
            .context("Failed to poll for token")?;

        let token_response: TokenResponse = response
            .json()
            .await
            .context("Failed to parse token response")?;

        match token_response {
            TokenResponse::Success(success) => {
                // Save the token
                let mut credentials = Credentials::load().unwrap_or_default();
                credentials.set_profile(
                    profile.to_string(),
                    ProfileCredentials {
                        token: success.access_token,
                    },
                );
                credentials.save().context("Failed to save credentials")?;

                // Save the service URL in config
                config.set_profile(
                    profile.to_string(),
                    ProfileConfig {
                        service_url: service_url.clone(),
                    },
                );
                config.save().context("Failed to save config")?;

                println!();
                println!("Successfully logged in!");
                println!();
                println!("Your credentials have been saved to {:?}", Credentials::path());
                return Ok(());
            }
            TokenResponse::Error(error) => {
                match error.error.as_str() {
                    "authorization_pending" => {
                        // Still waiting, continue polling
                        print!(".");
                        continue;
                    }
                    "slow_down" => {
                        // Slow down polling
                        tokio::time::sleep(poll_interval).await;
                        continue;
                    }
                    "access_denied" => {
                        bail!("Authorization denied by user");
                    }
                    "expired_token" => {
                        bail!("Device code expired. Please try again.");
                    }
                    _ => {
                        bail!("Authorization failed: {} - {}", error.error, error.error_description);
                    }
                }
            }
        }
    }
}
