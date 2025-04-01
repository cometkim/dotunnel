use bytes::Bytes;

#[derive(Debug)]
pub enum FormatError {}

#[derive(Debug)]
pub struct Message {
    intern: Bytes,
}
