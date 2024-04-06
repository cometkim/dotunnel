use anyhow::Result;
use serde::Deserialize;
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
};

use crate::sys;

#[derive(Debug, Deserialize, Default)]
pub struct Config {
    profile: HashMap<String, ProfileConfig>,
}

#[derive(Debug, Deserialize)]
pub struct ProfileConfig {}

const USER_PATH: &str = "dotunnel/config.toml";
const PROJECT_PATH: &str = ".dotunnel/config.toml";

impl Config {
    pub fn user_path<'a>() -> &'a Path {
        Path::new(USER_PATH)
    }

    pub fn project_path<'a>() -> &'a Path {
        Path::new(PROJECT_PATH)
    }

    fn load() {
        let path = sys::dirs::config_dir().map(|config_dir| config_dir.join(USER_PATH));
        ()
    }
}
