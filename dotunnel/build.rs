fn main() {
    capnpc::CompilerCommand::new()
        .src_prefix("src")
        .file("src/transport/message.capnp")
        .run()
        .expect("compiling message schema");
}
