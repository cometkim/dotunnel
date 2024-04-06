extern crate dirs_sys;

use std::path::PathBuf;

pub fn home_dir() -> Option<PathBuf> {
    dirs_sys::known_folder_profile()
}

pub fn config_dir() -> Option<PathBuf> {
    dirs_sys::known_folder_roaming_app_data()
}
