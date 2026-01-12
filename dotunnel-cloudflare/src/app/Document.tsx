import type * as React from "react";
import styles from "./styles.css?url";

type Props = {
  children: React.ReactNode;
};

export function Document({ children }: Props): React.ReactElement {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>DOtunnel</title>
        <link rel="stylesheet" href={styles} />
        <link rel="modulepreload" href="/src/client.tsx" />
      </head>
      <body>
        <div id="root">{children}</div>
        <script>import("/src/client.tsx")</script>
      </body>
    </html>
  );
}
