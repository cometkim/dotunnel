use anyhow::{Context, Result};
use serde::Deserialize;

use crate::config::{Config, Credentials};

#[derive(Debug, clap::Args)]
pub struct Args {}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
struct UserInfo {
    id: String,
    name: String,
    email: String,
    email_verified: bool,
    image: Option<String>,
}

pub async fn execute(_args: &Args, profile: &str) -> Result<()> {
    let credentials = Credentials::load().unwrap_or_default();
    let config = Config::load().unwrap_or_default();

    let creds = match credentials.get_profile(profile) {
        Some(c) => c,
        None => {
            println!("Not logged in to profile '{}'", profile);
            println!();
            println!("Run 'dotunnel login' to authenticate.");
            return Ok(());
        }
    };

    let profile_config = match config.get_profile(profile) {
        Some(c) => c,
        None => {
            println!("Profile '{}' has credentials but no config", profile);
            return Ok(());
        }
    };

    println!("Profile: {}", profile);
    println!("Service: {}", profile_config.service_url);
    println!();

    // Fetch user info from server
    let client = reqwest::Client::new();
    let user_url = format!("{}/_api/user", profile_config.service_url);

    let response = client
        .get(&user_url)
        .header("Authorization", format!("Bearer {}", creds.token))
        .send()
        .await
        .context("Failed to fetch user info")?;

    if !response.status().is_success() {
        if response.status() == 401 {
            println!("Your session has expired or been revoked.");
            println!();
            println!("Run 'dotunnel logout' and then 'dotunnel login' to re-authenticate.");
            return Ok(());
        }
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        println!("Failed to fetch user info: {} - {}", status, body);
        return Ok(());
    }

    let user: UserInfo = response
        .json()
        .await
        .context("Failed to parse user info")?;

    println!("Logged in as:");
    println!("  Name:  {}", user.name);
    println!("  Email: {}", user.email);
    if !user.email_verified {
        println!("  (email not verified)");
    }

    Ok(())
}
