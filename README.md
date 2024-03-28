# DOtunnel

Expose your local servers to the public internet with ease and reliability.

DOtunnel is a self-hosted alternative to ngrok that offers greater control and flexibility. It uses Cloudflare [Durable Objects] to ensure consistent performance and horizontal scalability, making it ideal for organizations and developers alike.

**DOtunnel is currently under development. Stay tuned!**

## Features

- Self-hosted on your own Cloudflare account
- Consistent performance and scalability with Cloudflare [Durable Objects]
- Less operational burden by leveraging Cloudflare platform
- Powerful management and integration features for organizations
- Built-in web server for easy testing of static file servers

## Installation

TBD

## CLI Usage

```sh
# setup default profile
dotunnel setup

# setup profile with name "work"
dotunnel setup --profile work
```

```sh
dotunnel login
```

```sh
# expose [::]:8000 to the public internet
dotunnel expose 8000

# expose ./public directory to the public internet
dotunnel expose ./public

# expose ./build.zip archive content to the public internet
dotunnel expose zip:./build.zip

# expose static text to the public internet
dotunnel expose text:"Ok"
dotunnel expose text:./my-secret.txt
```

Run `dotunnel --help` to see full detail.

## Deploy Your Own Relay Server

TBD

## Security & Privacy

DOTunnel is designed for organizational use and development purposes.

Every tunnel is secured via a WebSocket Secure connection, but TLS is going to be terminated once it reaches the Cloudflare infrastructure (You should trust them), allowing content to be read or manipulated for productivity and security features.

However, this doesn't necessarily mean you cannot use DOtunnel for personal use. You can configure another relay server into your personal Cloudflare account. DOtunnel CLI supports multiple relay servers via `--profile`

## LICENSE

MIT

[Durable Objects]: https://developers.cloudflare.com/durable-objects/
