use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs, path::PathBuf};

use crate::sys;

const CONFIG_DIR: &str = "dotunnel";
const CONFIG_FILE: &str = "config.toml";
const CREDENTIALS_FILE: &str = "credentials.toml";

#[derive(Debug, Deserialize, Serialize, Default)]
pub struct Config {
    #[serde(default)]
    pub profiles: HashMap<String, ProfileConfig>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ProfileConfig {
    /// The base URL of the DOtunnel service
    pub service_url: String,
}

#[derive(Debug, Deserialize, Serialize, Default)]
pub struct Credentials {
    #[serde(default)]
    pub profiles: HashMap<String, ProfileCredentials>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ProfileCredentials {
    /// The CLI access token
    pub token: String,
}

impl Config {
    /// Get the config directory path
    pub fn dir() -> Option<PathBuf> {
        sys::dirs::config_dir().map(|dir| dir.join(CONFIG_DIR))
    }

    /// Get the config file path
    pub fn path() -> Option<PathBuf> {
        Self::dir().map(|dir| dir.join(CONFIG_FILE))
    }

    /// Load config from disk
    pub fn load() -> Result<Self> {
        let path = Self::path().context("Could not determine config path")?;

        if !path.exists() {
            return Ok(Self::default());
        }

        let content = fs::read_to_string(&path)
            .with_context(|| format!("Failed to read config from {:?}", path))?;

        toml::from_str(&content).context("Failed to parse config")
    }

    /// Save config to disk
    pub fn save(&self) -> Result<()> {
        let dir = Self::dir().context("Could not determine config directory")?;
        fs::create_dir_all(&dir)
            .with_context(|| format!("Failed to create config directory {:?}", dir))?;

        let path = Self::path().context("Could not determine config path")?;
        let content = toml::to_string_pretty(self).context("Failed to serialize config")?;

        fs::write(&path, content)
            .with_context(|| format!("Failed to write config to {:?}", path))?;

        Ok(())
    }

    /// Get a profile config, or create default if it doesn't exist
    pub fn get_profile(&self, name: &str) -> Option<&ProfileConfig> {
        self.profiles.get(name)
    }

    /// Set a profile config
    pub fn set_profile(&mut self, name: String, profile: ProfileConfig) {
        self.profiles.insert(name, profile);
    }
}

impl Credentials {
    /// Get the credentials file path
    pub fn path() -> Option<PathBuf> {
        Config::dir().map(|dir| dir.join(CREDENTIALS_FILE))
    }

    /// Load credentials from disk
    pub fn load() -> Result<Self> {
        let path = Self::path().context("Could not determine credentials path")?;

        if !path.exists() {
            return Ok(Self::default());
        }

        let content = fs::read_to_string(&path)
            .with_context(|| format!("Failed to read credentials from {:?}", path))?;

        toml::from_str(&content).context("Failed to parse credentials")
    }

    /// Save credentials to disk
    pub fn save(&self) -> Result<()> {
        let dir = Config::dir().context("Could not determine config directory")?;
        fs::create_dir_all(&dir)
            .with_context(|| format!("Failed to create config directory {:?}", dir))?;

        let path = Self::path().context("Could not determine credentials path")?;
        let content = toml::to_string_pretty(self).context("Failed to serialize credentials")?;

        fs::write(&path, content)
            .with_context(|| format!("Failed to write credentials to {:?}", path))?;

        // Set restrictive permissions on Unix
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let permissions = std::fs::Permissions::from_mode(0o600);
            fs::set_permissions(&path, permissions)?;
        }

        Ok(())
    }

    /// Get credentials for a profile
    pub fn get_profile(&self, name: &str) -> Option<&ProfileCredentials> {
        self.profiles.get(name)
    }

    /// Set credentials for a profile
    pub fn set_profile(&mut self, name: String, creds: ProfileCredentials) {
        self.profiles.insert(name, creds);
    }

    /// Remove credentials for a profile
    pub fn remove_profile(&mut self, name: &str) -> Option<ProfileCredentials> {
        self.profiles.remove(name)
    }
}
