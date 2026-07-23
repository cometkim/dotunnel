use std::env;
use std::path::PathBuf;

use rkyv_js_codegen::CodeGenerator;

fn main() -> Result<(), rkyv_js_codegen::Error> {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());

    let mut codegen = CodeGenerator::new();
    codegen.set_header(
        "Generated TypeScript codecs for the DOtunnel wire protocol.\n\
         Source of truth: dotunnel/src/transport/message.rs — do not edit by hand.",
    );
    codegen.add_source_dir(manifest_dir.join("src/transport"))?;

    let src_dir = manifest_dir.join("src");
    codegen.write_to_file(src_dir.join("transport.gen.ts"))?;

    println!("cargo:rerun-if-changed=src/transport/message.rs");
    println!("cargo:rerun-if-changed=build.rs");
    Ok(())
}
