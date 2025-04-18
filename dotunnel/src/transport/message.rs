use std::io::Cursor;

use bytes::{BufMut, Bytes, BytesMut};
use capnp::{
    message::{ReaderOptions, TypedBuilder},
    serialize_packed,
};
use thiserror::Error;

use crate::message_capnp;

/// Each WebSocket message size should be less than 1 MiB
/// 
/// See https://developers.cloudflare.com/durable-objects/platform/limits/
pub const SIZE_LIMIT: usize = 1_048_576;

#[derive(Debug)]
pub struct Message {
    inner: Bytes,
}

#[derive(Debug, Error)]
pub enum MessageError {
    #[error("Failed to (de)serialize message")]
    Serialization(#[from] capnp::Error),

    #[error("Each message size should be less than 1 MiB, size: {0}")]
    SizeLimit(usize),
}

pub type MessageReader<'a> = message_capnp::message::Reader<'a>;
pub type MessageBuilder<'a> = message_capnp::message::Builder<'a>;

impl From<Bytes> for Message {
    fn from(value: Bytes) -> Self {
        Self { inner: value }
    }
}

impl Message {
    pub fn into_inner(&self) -> Bytes {
        self.inner.to_owned()
    }

    pub fn read_with<F, R>(&self, f: F) -> Result<R, MessageError>
    where
        F: FnOnce(MessageReader) -> R,
    {
        let buf_reader =
            serialize_packed::read_message(Cursor::new(self.inner.as_ref()), ReaderOptions::new())?;
        let msg_reader = buf_reader.get_root::<MessageReader>()?;
        Ok(f(msg_reader))
    }

    pub fn build_with<F>(f: F) -> Result<Self, MessageError>
    where
        F: FnOnce(&mut MessageBuilder),
    {
        let mut builder = TypedBuilder::<message_capnp::message::Owned>::new_default();
        let mut msg_builder = builder.get_root()?;
        f(&mut msg_builder);

        let capacity =
            msg_builder.total_size()?.word_count as usize * capnp::private::units::BYTES_PER_WORD;
        if capacity > SIZE_LIMIT {
            return Err(MessageError::SizeLimit(capacity));
        }

        let mut buf = BytesMut::with_capacity(capacity);
        serialize_packed::write_message((&mut buf).writer(), builder.borrow_inner_mut())?;
        Ok(buf.freeze().into())
    }
}

#[cfg(test)]
mod tests {
    use crate::message_capnp::message::Which::RequestInit;

    use super::Message;

    #[test]
    fn test_message_roundtrip() {
        let message = Message::build_with(|builder| {
            let mut req_init = builder.reborrow().init_request_init();
            req_init.set_time(12345678);
            req_init.set_method("GET");
            req_init.set_uri("https://github.com/cometkim/dotunnel");
            req_init.set_version(1);
            req_init.set_has_body(true);
            let mut headers = req_init.reborrow().init_headers(1);
            let mut header0 = headers.reborrow().get(0);
            header0.set_key("Content-Type");
            header0.set_value("text/plain");
        })
        .unwrap();

        message
            .read_with(|reader| match reader.which().unwrap() {
                RequestInit(Ok(req_init)) => {
                    assert_eq!(req_init.get_time(), 12345678);
                    assert_eq!(req_init.get_method().unwrap(), "GET");
                    assert_eq!(
                        req_init.get_uri().unwrap(),
                        "https://github.com/cometkim/dotunnel"
                    );
                    assert_eq!(req_init.get_version(), 1);
                    assert!(req_init.get_has_body());
                    let headers = req_init.get_headers().unwrap();
                    let header0 = headers.get(0);
                    assert_eq!(headers.len(), 1);
                    assert_eq!(header0.get_key().unwrap(), "Content-Type");
                    assert_eq!(header0.get_value().unwrap(), "text/plain");
                }
                _ => panic!("Failed to read message"),
            })
            .unwrap();
    }
}
