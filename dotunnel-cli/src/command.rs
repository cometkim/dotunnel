pub mod login;
pub mod logout;
pub mod setup;
pub mod status;
pub mod tunnel;

#[derive(Debug, clap::Subcommand)]
pub enum Command {
    /// Log in to DOtunnel service
    Login(login::Args),

    /// Log out from DOtunnel service
    Logout(logout::Args),

    /// Show current login status
    Status(status::Args),

    /// Setup local development environment
    Setup(setup::Args),

    /// Start a tunnel to expose a local server
    Tunnel(tunnel::Args),
}
