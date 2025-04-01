use serde::Deserialize;
use std::{collections::HashMap, path::Path};

use crate::sys;

#[derive(Debug, Deserialize, Default)]
pub struct Config {
    profile: HashMap<String, ProfileConfig>,
}

#[derive(Debug, Deserialize)]
pub struct ProfileConfig {}

const USER_PATH: &str = "dotunnel/config.toml";

impl Config {
    pub fn user_path<'a>() -> &'a Path {
        Path::new(USER_PATH)
    }

    fn load() {
        let path = sys::dirs::config_dir().map(|config_dir| config_dir.join(USER_PATH));
    }
}
