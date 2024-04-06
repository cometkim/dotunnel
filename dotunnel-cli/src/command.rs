pub mod setup;

#[derive(Debug, clap::Subcommand)]
pub enum Command {
    Setup(setup::Args),
}
