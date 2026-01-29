use anyhow::{Context, Result};

use crate::config::{Config, Credentials};

#[derive(Debug, clap::Args)]
pub struct Args {
    /// Force logout without revoking token on server
    #[arg(long)]
    force: bool,
}

pub async fn execute(args: &Args, profile: &str) -> Result<()> {
    let mut credentials = Credentials::load().unwrap_or_default();

    let creds = match credentials.get_profile(profile) {
        Some(c) => c.clone(),
        None => {
            println!("Not logged in to profile '{}'", profile);
            return Ok(());
        }
    };

    // Try to revoke token on server unless --force is used
    if !args.force {
        let config = Config::load().unwrap_or_default();
        if let Some(profile_config) = config.get_profile(profile) {
            let client = reqwest::Client::new();
            let logout_url = format!("{}/_api/logout", profile_config.service_url);

            match client
                .post(&logout_url)
                .header("Authorization", format!("Bearer {}", creds.token))
                .send()
                .await
            {
                Ok(response) => {
                    if response.status().is_success() {
                        tracing::debug!("Token revoked on server");
                    } else {
                        tracing::debug!(
                            "Failed to revoke token on server: {}",
                            response.status()
                        );
                    }
                }
                Err(e) => {
                    tracing::debug!("Failed to contact server for logout: {}", e);
                }
            }
        }
    }

    // Remove local credentials
    credentials.remove_profile(profile);
    credentials.save().context("Failed to save credentials")?;

    println!("Logged out from profile '{}'", profile);
    Ok(())
}
