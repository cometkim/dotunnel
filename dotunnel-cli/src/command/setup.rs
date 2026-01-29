use anyhow::Result;

#[derive(Debug, clap::Args)]
pub struct Args {}

pub fn execute(_args: &Args) -> Result<()> {
    Ok(())
}
