# Turing Signing Servers (Turrets)

- [API Docs](https://www.notion.so/tyvdh/Turing-Signing-Servers-661f3ff0de5143c1bd3c6fb52ae88dae) [Source of truth]
- [Get Setup Locally](https://youtu.be/StYbvqQnyuc) [Might be outdated]
- [Create and Upload a Contract](https://youtu.be/n_XQV53YkyA) [Might be outdated]

## Run locally

Prerequisites:
* node.js
* docker

```sh
npm install
docker-compose up -d
npm run dev-0
```

# Troubleshooting

There is an issue with `serverless-offline` on Node v15.5.0  where only GET requests will be processed properly (see [here](https://github.com/dherault/serverless-offline/issues/1151)). The solution for now is downgrading to another version of Node.
