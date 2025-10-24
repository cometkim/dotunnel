pub mod message_capnp {
    include!(concat!(env!("OUT_DIR"), "/transport/message_capnp.rs"));
}
pub mod transport;
